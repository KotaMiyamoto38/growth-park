import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";

process.env.NEON_DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.SESSION_SECRET = "local-sheet-state-test-secret-do-not-use";
process.env.GOOGLE_CLIENT_ID = "local-test-client";
process.env.GOOGLE_CLIENT_SECRET = "local-test-secret";
const { registerSheetRoutes } = await import("./sheetRoutes");
const auth = await import("./googleSheetsAuth");
const { SheetsExportError } = await import("./sheetExportService");

test("Sheets OAuth state is bound to the initiating browser, purpose, user and expiry", () => {
  const started = auth.startSheetsConnection(7, "owner@example.com");
  const url = new URL(started.url);
  const state = url.searchParams.get("state")!;
  const cookie = `${auth.SHEETS_STATE_COOKIE}=${started.nonce}`;
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(auth.validateSheetsState(state, cookie), 7);
  assert.match(url.searchParams.get("scope")!, /\/auth\/spreadsheets/);
  assert.doesNotMatch(url.searchParams.get("scope")!, /calendar/);
  assert.throws(() => auth.validateSheetsState(state));
  assert.throws(() => auth.validateSheetsState(state, cookie + "bad"));
  assert.throws(() => auth.validateSheetsState(state + "x", cookie));
  for (const payload of [
    { purpose: "calendar", userId: 7, nonce: started.nonce },
    { purpose: "sheet-export", userId: -1, nonce: started.nonce },
    { purpose: "sheet-export", userId: 7, nonce: started.nonce, exp: 1 },
  ]) {
    const invalid = jwt.sign(payload, process.env.SESSION_SECRET!, {
      algorithm: "HS256", issuer: "growth-park-sheets", audience: "google-sheets-callback",
    });
    assert.throws(() => auth.validateSheetsState(`sheets.${invalid}`, cookie));
  }
});

test("sheet routes enforce admin access, server-owned data and safe OAuth failures", async () => {
  let exported: any[] = [];
  let role = "AddBox";
  let connectionCalls = 0;
  let exportError: Error | undefined;
  const savedLead = { id: 21, supporterId: 4, companyName: "保存済み企業", companyWebsite: "https://example.com" };
  const deps = {
    ...auth,
    storage: {
      getUser: async () => ({ id: 7, role }),
      getLead: async (id: number) => id === 21 ? savedLead : undefined,
      getSupporter: async () => ({ companyName: "株式会社Think UP" }),
    },
    getSheetsConnectionStatus: async () => ({ connected: false, ready: false }),
    completeSheetsConnection: async () => { connectionCalls++; },
    exportLeadToSheet: async (...args: any[]) => {
      exported.push(args);
      if (exportError) throw exportError;
      return { alreadyExported: false, rowNumber: 14, supporterName: "株式会社Think UP",
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/allowed/edit" };
    },
  };
  const app = express();
  app.use(express.json());
  const authenticate: express.RequestHandler = (req: any, res, next) => {
    if (!req.headers.authorization) return res.sendStatus(401);
    req.user = { id: 7, role: req.headers.authorization, email: "owner@example.com" };
    next();
  };
  const requireRole = (roles: string[]): express.RequestHandler => (req: any, res, next) => {
    if (!roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  };
  registerSheetRoutes(app, authenticate, requireRole, deps as any);
  app.get(auth.SHEETS_CALLBACK_PATH, (_req, res) => res.send("calendar callback"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = (route: string, actor?: string, body?: object) => fetch(base + route, {
    method: "POST", headers: { "Content-Type": "application/json", ...(actor ? { authorization: actor } : {}) },
    body: JSON.stringify(body || {}), redirect: "manual",
  });
  try {
    for (const route of ["/api/leads/21/export-to-sheet", "/api/admin/google-sheets/connect"]) {
      assert.equal((await request(route)).status, 401);
      for (const actor of ["Connector", "Supporter", "Client"]) assert.equal((await request(route, actor)).status, 403);
    }
    assert.equal(exported.length, 0);
    assert.equal((await request("/api/leads/21oops/export-to-sheet", "AddBox")).status, 400);
    assert.equal((await request("/api/leads/999/export-to-sheet", "AddBox")).status, 404);
    const response = await request("/api/leads/21/export-to-sheet", "AddBox", {
      companyName: "ATTACKER", spreadsheetId: "OTHER", rowNumber: 1,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(exported[0], [savedLead, "株式会社Think UP"]);
    exportError = new SheetsExportError(400, "シート入力に該当しない企業です");
    assert.equal((await (await request("/api/leads/21/export-to-sheet", "AddBox")).json()).message, exportError.message);
    exportError = new Error("TOKEN_AND_PRIVATE_CELLS");
    assert.doesNotMatch(await (await request("/api/leads/21/export-to-sheet", "AddBox")).text(), /TOKEN|PRIVATE/);

    const connect = await request("/api/admin/google-sheets/connect", "AddBox");
    assert.equal(connect.status, 200);
    const cookie = connect.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const state = new URL((await connect.json()).url).searchParams.get("state")!;
    const callback = `${base}${auth.SHEETS_CALLBACK_PATH}?state=${encodeURIComponent(state)}&code=SECRET_CODE`;
    const noCookie = await fetch(callback, { redirect: "manual" });
    assert.equal(noCookie.headers.get("location"), "/settings?googleSheets=error&googleSheetsReason=invalid-state");
    assert.equal(connectionCalls, 0);
    role = "Connector";
    assert.equal((await fetch(callback, { headers: { cookie }, redirect: "manual" })).headers.get("location"), "/settings?googleSheets=error&googleSheetsReason=admin-required");
    assert.equal(connectionCalls, 0);
    role = "AddBox";
    const success = await fetch(callback, { headers: { cookie }, redirect: "manual" });
    assert.equal(success.headers.get("location"), "/settings?googleSheets=connected");
    assert.equal(success.headers.get("referrer-policy"), "no-referrer");
    assert.equal(connectionCalls, 1);
    assert.equal(await (await fetch(`${base}${auth.SHEETS_CALLBACK_PATH}?state=legacy`)).text(), "calendar callback");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("Sheets callback exposes only fixed failure categories, never Google error details", async () => {
  const secret = "SECRET_TOKEN_AUTH_CODE_PRIVATE_FILE";
  const failures: Array<[unknown, string]> = [
    [{ response: { status: 403, data: { error: { message: secret,
      details: [{ reason: "SERVICE_DISABLED", metadata: { activationUrl: secret } }] } } } }, "api-disabled"],
    [{ response: { status: 403, data: { error: { message: secret,
      errors: [{ reason: "accessNotConfigured" }] } } } }, "api-disabled"],
    [{ code: 403, errors: [{ reason: "accessNotConfigured", message: secret }] }, "api-disabled"],
    [{ response: { status: 403, data: { error: { message: secret } } } }, "destination-permission"],
    [{ response: { status: 404, data: { error: { message: secret } } } }, "destination-permission"],
    [{ response: { status: 400, data: { error: "invalid_grant", error_description: secret } } }, "expired"],
    [new auth.SheetsConnectionError(400, "Googleの連携許可を確認して、もう一度連携してください。"), "missing-refresh-token"],
    [new auth.SheetsConnectionError(400, "スプレッドシートの編集権限が許可されていません。"), "missing-scope"],
    [new auth.SheetsConnectionError(503, "Google連携の接続設定が不足しています。"), "configuration"],
    [new auth.SheetsConnectionError(503, "Google連携の安全な接続設定が不足しています。"), "configuration"],
    [new auth.SheetsConnectionError(409, "転記先のシート構成が変更されています。管理者に確認してください。"), "destination-changed"],
    [new auth.SheetsConnectionError(400, secret, "account-unverified"), "account-unverified"],
    [new auth.SheetsConnectionError(500, secret, secret as any), "unknown"],
    [new Error(secret), "unknown"],
    [{ message: `SERVICE_DISABLED invalid_grant ${secret}` }, "unknown"],
    [null, "unknown"],
  ];
  let failure: unknown;
  let connectionCalls = 0;
  const deps = {
    ...auth,
    storage: { getUser: async () => ({ id: 7, role: "AddBox" }) },
    validateSheetsState: () => 7,
    completeSheetsConnection: async () => { connectionCalls++; throw failure; },
  };
  const app = express();
  const pass: express.RequestHandler = (_req, _res, next) => next();
  registerSheetRoutes(app, pass, () => pass, deps as any);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}${auth.SHEETS_CALLBACK_PATH}?state=sheets.fixture`;
  try {
    for (const [error, reason] of failures) {
      failure = error;
      const response = await fetch(`${base}&code=${secret}`, { redirect: "manual" });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), `/settings?googleSheets=error&googleSheetsReason=${reason}`);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(JSON.stringify([...response.headers]) + await response.text(), new RegExp(secret));
    }
    const callsBeforeDenied = connectionCalls;
    for (const [query, reason] of [["error=access_denied", "cancelled"],
      [`error=${secret}&error_description=${secret}`, "unknown"], ["", "invalid-state"]]) {
      const response = await fetch(`${base}&${query}`, { redirect: "manual" });
      assert.equal(response.headers.get("location"), `/settings?googleSheets=error&googleSheetsReason=${reason}`);
      assert.doesNotMatch(await response.text(), new RegExp(secret));
    }
    assert.equal(connectionCalls, callsBeforeDenied);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
