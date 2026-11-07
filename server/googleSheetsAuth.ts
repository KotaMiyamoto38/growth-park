import { google, type sheets_v4 } from "googleapis";
import { randomBytes, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "./db";
import { SHEET_TARGETS } from "@shared/sheetTargets";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export const SHEETS_STATE_COOKIE = "growth_park_sheets_state";
export const SHEETS_CALLBACK_PATH = "/api/auth/google/callback";

export class SheetsConnectionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let tablesReady: Promise<void> | undefined;
// Additive, idempotent setup: never change existing business/calendar tables.
export function ensureSheetsTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS google_sheet_connection (
        id integer PRIMARY KEY CHECK (id = 1), email text NOT NULL,
        access_token text NOT NULL, refresh_token text NOT NULL,
        token_expiry timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS lead_sheet_exports (
        lead_id integer NOT NULL, spreadsheet_id text NOT NULL,
        sheet_id integer NOT NULL, row_number integer NOT NULL,
        metadata_id integer NOT NULL, payload jsonb NOT NULL,
        status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'uncertain')),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (lead_id, spreadsheet_id),
        UNIQUE (spreadsheet_id, sheet_id, row_number),
        UNIQUE (spreadsheet_id, metadata_id)
      )`);
    })().catch(error => { tablesReady = undefined; throw error; });
  }
  return tablesReady;
}

function stateSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret || secret === "your-secret-key") {
    throw new SheetsConnectionError(503, "Google連携の安全な接続設定が不足しています。");
  }
  return secret;
}

function createClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new SheetsConnectionError(503, "Google連携の接続設定が不足しています。");
  }
  const redirect = process.env.GOOGLE_REDIRECT_URI
    || `${process.env.RENDER_EXTERNAL_URL || (process.env.NODE_ENV === "production"
      ? "https://growth-park.onrender.com" : "http://localhost:5000")}${SHEETS_CALLBACK_PATH}`;
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirect);
}

export function startSheetsConnection(userId: number, email?: string) {
  const client = createClient();
  const nonce = randomBytes(32).toString("hex");
  const signedState = jwt.sign({ purpose: "sheet-export", userId, nonce }, stateSecret(), {
    algorithm: "HS256", issuer: "growth-park-sheets", audience: "google-sheets-callback", expiresIn: "10m",
  });
  return { nonce, url: client.generateAuthUrl({
    access_type: "offline", prompt: "consent", login_hint: email,
    scope: [SHEETS_SCOPE, "https://www.googleapis.com/auth/userinfo.email"],
    state: `sheets.${signedState}`,
  }) };
}

export function validateSheetsState(rawState: string, cookieHeader?: string): number {
  const value = cookieHeader?.split(";").map(part => part.trim())
    .find(part => part.startsWith(`${SHEETS_STATE_COOKIE}=`))?.slice(SHEETS_STATE_COOKIE.length + 1);
  if (!rawState.startsWith("sheets.") || !value) throw new Error("invalid_state");
  const state = jwt.verify(rawState.slice(7), stateSecret(), {
    algorithms: ["HS256"], issuer: "growth-park-sheets", audience: "google-sheets-callback",
  }) as jwt.JwtPayload;
  if (state.purpose !== "sheet-export" || !Number.isSafeInteger(state.userId) || state.userId <= 0
    || typeof state.nonce !== "string" || !/^[a-f0-9]{64}$/.test(state.nonce)
    || !/^[a-f0-9]{64}$/.test(value)
    || !timingSafeEqual(Buffer.from(value), Buffer.from(state.nonce))) throw new Error("invalid_state");
  return state.userId;
}

async function verifyDestinations(sheets: sheets_v4.Sheets) {
  for (const target of SHEET_TARGETS) {
    const result = await sheets.spreadsheets.get({
      spreadsheetId: target.spreadsheetId,
      fields: "spreadsheetId,sheets.properties(sheetId,title)",
    }, { timeout: 15000, retry: false });
    if (!result.data.sheets?.some(sheet => sheet.properties?.sheetId === target.sheetId
      && sheet.properties.title === target.sheetName)) {
      throw new SheetsConnectionError(409, "転記先のシート構成が変更されています。管理者に確認してください。");
    }
  }
}

export async function completeSheetsConnection(code: string): Promise<void> {
  await ensureSheetsTables();
  const client = createClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new SheetsConnectionError(400, "Googleの連携許可を確認して、もう一度連携してください。");
  }
  const granted = tokens.scope?.split(" ") || (await client.getTokenInfo(tokens.access_token)).scopes;
  if (!granted.includes(SHEETS_SCOPE)) {
    throw new SheetsConnectionError(400, "スプレッドシートの編集権限が許可されていません。");
  }
  const info = await google.oauth2({ version: "v2", auth: client }).userinfo.get({}, { timeout: 15000, retry: false });
  if (!info.data.email || !info.data.verified_email) throw new Error("unverified_google_email");
  await verifyDestinations(google.sheets({ version: "v4", auth: client }));
  // Verify read access to both fixed destinations before saving. Sheets has no
  // read-only capabilities check for edit permission; actual writes enforce it.
  await pool.query(`INSERT INTO google_sheet_connection
    (id,email,access_token,refresh_token,token_expiry) VALUES (1,$1,$2,$3,$4)
    ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email,access_token=EXCLUDED.access_token,
    refresh_token=EXCLUDED.refresh_token,token_expiry=EXCLUDED.token_expiry,updated_at=now()`,
  [info.data.email, tokens.access_token, tokens.refresh_token, tokens.expiry_date ? new Date(tokens.expiry_date) : null]);
}

export async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  await ensureSheetsTables();
  const result = await pool.query("SELECT * FROM google_sheet_connection WHERE id=1");
  const saved = result.rows[0];
  if (!saved) throw new SheetsConnectionError(503, "設定画面でGoogleスプレッドシートを連携してください。");
  const client = createClient();
  client.setCredentials({ access_token: saved.access_token, refresh_token: saved.refresh_token,
    expiry_date: saved.token_expiry ? new Date(saved.token_expiry).getTime() : undefined });
  // Conditional update cannot overwrite a newer reconnection with old credentials.
  client.on("tokens", tokens => {
    void pool.query(`UPDATE google_sheet_connection SET access_token=$1,
      refresh_token=COALESCE($2,refresh_token),token_expiry=$3,updated_at=now()
      WHERE id=1 AND refresh_token=$4`,
    [tokens.access_token || saved.access_token, tokens.refresh_token || null,
      tokens.expiry_date ? new Date(tokens.expiry_date) : saved.token_expiry, saved.refresh_token])
      .catch(() => console.error("Google Sheets token persistence failed"));
  });
  return google.sheets({ version: "v4", auth: client });
}

export async function getSheetsConnectionStatus() {
  await ensureSheetsTables();
  const result = await pool.query("SELECT email FROM google_sheet_connection WHERE id=1");
  if (!result.rows[0]) return { connected: false, ready: false };
  try {
    await verifyDestinations(await getSheetsClient());
    return { connected: true, ready: true, email: result.rows[0].email };
  } catch {
    return { connected: true, ready: false, email: result.rows[0].email,
      message: "転記先へのアクセスを確認できません。両方のシートを編集できるGoogleアカウントで再連携してください。" };
  }
}
