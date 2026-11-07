import type { Express, RequestHandler } from "express";
import { storage } from "./storage";
import * as auth from "./googleSheetsAuth";
import { exportLeadToSheet, SheetsExportError } from "./sheetExportService";

const services = { storage, ...auth, exportLeadToSheet };
type Services = typeof services;

export function registerSheetRoutes(app: Express, authenticate: RequestHandler,
  requireRole: (roles: string[]) => RequestHandler, deps: Services = services) {
  const admin = requireRole(["AddBox"]);
  const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const, path: auth.SHEETS_CALLBACK_PATH };

  app.get("/api/admin/google-sheets/status", authenticate, admin, async (_req, res) => {
    try { res.json(await deps.getSheetsConnectionStatus()); }
    catch { res.status(503).json({ message: "Googleスプレッドシートの連携状態を確認できません。" }); }
  });

  app.post("/api/admin/google-sheets/connect", authenticate, admin, async (req: any, res) => {
    try {
      const connection = deps.startSheetsConnection(req.user.id, req.user.email);
      res.cookie(auth.SHEETS_STATE_COOKIE, connection.nonce, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
      res.json({ url: connection.url });
    } catch {
      res.status(503).json({ message: "Google連携の接続設定を確認してください。" });
    }
  });

  // Share the already registered Google redirect URI; calendar callbacks pass through.
  app.get(auth.SHEETS_CALLBACK_PATH, async (req, res, next) => {
    const state = req.query.state;
    if (typeof state !== "string" || !state.startsWith("sheets.")) return next();
    res.clearCookie(auth.SHEETS_STATE_COOKIE, cookieOptions);
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    try {
      const userId = deps.validateSheetsState(state, req.headers.cookie);
      const actor = await deps.storage.getUser(userId);
      if (!actor || actor.role !== "AddBox") {
        throw new auth.SheetsConnectionError(403, "管理者としてログインし直してください。", "admin-required");
      }
      if (req.query.error) {
        throw new auth.SheetsConnectionError(400, "Googleの連携許可を確認してください。",
          req.query.error === "access_denied" ? "cancelled" : "unknown");
      }
      if (typeof req.query.code !== "string" || !req.query.code) {
        throw new auth.SheetsConnectionError(400, "設定画面から連携をやり直してください。", "invalid-state");
      }
      await deps.completeSheetsConnection(req.query.code);
      res.redirect("/settings?googleSheets=connected");
    } catch (error) {
      // Google errors may contain auth codes, headers, tokens or private file details.
      const reason = auth.getSheetsConnectionFailureReason(error);
      res.redirect(`/settings?googleSheets=error&googleSheetsReason=${reason}`);
    }
  });

  app.post("/api/leads/:id/export-to-sheet", authenticate, admin, async (req, res) => {
    if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) {
      return res.status(400).json({ message: "商談IDが無効です。" });
    }
    try {
      const lead = await deps.storage.getLead(Number(req.params.id));
      if (!lead) return res.status(404).json({ message: "商談が見つかりません。" });
      const supporter = lead.supporterId ? await deps.storage.getSupporter(lead.supporterId) : undefined;
      // All exported values and the destination come from saved server-side data.
      const result = await deps.exportLeadToSheet(lead, supporter?.companyName || "");
      res.json({ ...result, message: result.alreadyExported
        ? "この商談はすでにシートへ転記済みです。" : "スプレッドシートへ転記しました。" });
    } catch (error) {
      if (error instanceof SheetsExportError || error instanceof auth.SheetsConnectionError) {
        return res.status(error.status).json({ message: error.message });
      }
      res.status(502).json({ message: "転記結果を確認できませんでした。再度ボタンを押すと転記済みか確認します。" });
    }
  });
}
