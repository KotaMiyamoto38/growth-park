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
    assert.equal(noCookie.headers.get("location"), "/settings?googleSheets=error");
    assert.equal(connectionCalls, 0);
    role = "Connector";
    assert.equal((await fetch(callback, { headers: { cookie }, redirect: "manual" })).headers.get("location"), "/settings?googleSheets=error");
    assert.equal(connectionCalls, 0);
    role = "AddBox";
    const success = await fetch(callback, { headers: { cookie }, redirect: "manual" });
    assert.equal(success.headers.get("location"), "/settings?googleSheets=connected");
    assert.equal(success.headers.get("referrer-policy"), "no-referrer");
    assert.equal(connectionCalls, 1);
    assert.equal(await (await fetch(`${base}${auth.SHEETS_CALLBACK_PATH}?state=legacy`)).text(), "calendar callback");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
