import type { sheets_v4 } from "googleapis";
import type { Lead } from "@shared/schema";
import { getSheetTarget, type SheetTarget } from "@shared/sheetTargets";
import { pool } from "./db";
import { getSheetsClient } from "./googleSheetsAuth";

export class SheetsExportError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "SheetsExportError";
  }
}

type Payload = {
  version: 1;
  companyName: string;
  companyWebsite: string;
  position: string;
  contactPerson: string;
  assignedPerson: string;
  meetingDateSerial: number | null;
};
type Reservation = {
  lead_id: number;
  spreadsheet_id: string;
  sheet_id: number;
  row_number: number;
  metadata_id: number;
  payload: Payload;
  status: "pending" | "succeeded" | "uncertain";
};
type SqlClient = {
  query(text: string, values?: any[]): Promise<{ rows: any[] }>;
  release(): void;
};
type Dependencies = {
  pool: {
    connect(): Promise<SqlClient>;
    query(text: string, values?: any[]): Promise<{ rows: any[] }>;
  };
  getSheetsClient(): Promise<sheets_v4.Sheets>;
};
type ExportResult = {
  alreadyExported: boolean;
  spreadsheetUrl: string;
  rowNumber: number;
  supporterName: string;
};

const METADATA_KEY = "growthPark.sheetExport.v1";
const HEADERS = ["企業名", "HP", "役職", "担当者", "担当者", "商談日"];
const REQUEST_OPTIONS = { retry: false, timeout: 15000 };
const READ_CHUNK_ROWS = 1000;
const SHEETS_EPOCH_DAYS = 25569;
const DAY_MS = 86400000;

function a1(target: SheetTarget, cells: string): string {
  return `'${target.sheetName.replace(/'/g, "''")}'!${cells}`;
}

function snapshot(lead: Lead): Payload {
  let meetingDateSerial: number | null = null;
  if (lead.meetingDate) {
    const time = new Date(lead.meetingDate).getTime();
    if (!Number.isFinite(time)) throw new SheetsExportError(400, "商談日時の形式が正しくありません");
    // Sheets stores local wall time as a serial. Keep JST time; each template's
    // existing number format decides whether the time is displayed.
    meetingDateSerial = (time + 9 * 60 * 60 * 1000) / DAY_MS + SHEETS_EPOCH_DAYS;
  }
  return {
    version: 1,
    companyName: lead.companyName,
    companyWebsite: lead.companyWebsite || "",
    position: lead.position || "",
    contactPerson: lead.contactPerson,
    assignedPerson: lead.assignedPerson || "",
    meetingDateSerial,
  };
}

function businessRowOccupied(values: unknown[], target: SheetTarget): boolean {
  return values.some((value, index) => !(target.skipPosition && index === 2)
    && value !== null && value !== undefined && value !== "");
}

function safeFailure(error: unknown): SheetsExportError {
  if (error instanceof SheetsExportError) return error;
  const failure = error as { code?: unknown; response?: { status?: unknown } };
  const code = Number(failure?.response?.status || failure?.code);
  if (code === 401) return new SheetsExportError(503, "Googleシートの連携をやり直してください");
  if (code === 403) return new SheetsExportError(403, "Googleシートの編集権限とGoogle Sheets APIの設定をご確認ください");
  if (code === 404) return new SheetsExportError(404, "転記先のGoogleシートが見つかりません。共有設定をご確認ください");
  return new SheetsExportError(502, "シートへの転記結果を確認できませんでした。同じボタンを押すと、重複を確認して再開します");
}

async function verifyTemplate(sheets: sheets_v4.Sheets, target: SheetTarget): Promise<number> {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: target.spreadsheetId,
    fields: "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))",
  }, REQUEST_OPTIONS);
  const sheet = metadata.data.sheets?.find(item => item.properties?.sheetId === target.sheetId)?.properties;
  const rowCount = sheet?.gridProperties?.rowCount;
  if (sheet?.title !== target.sheetName || !rowCount || rowCount < target.startRow
    || (sheet.gridProperties?.columnCount || 0) < 7) {
    throw new SheetsExportError(409, "転記先のシート構成が変更されています。管理者にご確認ください");
  }
  const headers = await sheets.spreadsheets.values.get({
    spreadsheetId: target.spreadsheetId, range: a1(target, "B3:G3"), valueRenderOption: "FORMULA",
  }, REQUEST_OPTIONS);
  if (!HEADERS.every((value, index) => headers.data.values?.[0]?.[index] === value)) {
    throw new SheetsExportError(409, "転記先の列見出しが変更されています。管理者にご確認ください");
  }
  return rowCount;
}

async function findLastBusinessRow(sheets: sheets_v4.Sheets, target: SheetTarget, rowCount: number): Promise<number> {
  let last = target.startRow - 1;
  for (let start = target.startRow; start <= rowCount; start += READ_CHUNK_ROWS) {
    const end = Math.min(rowCount, start + READ_CHUNK_ROWS - 1);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: target.spreadsheetId, range: a1(target, `B${start}:G${end}`), valueRenderOption: "FORMULA",
    }, REQUEST_OPTIONS);
    (response.data.values || []).forEach((row, index) => {
      if (businessRowOccupied(row, target)) last = start + index;
    });
  }
  return last;
}

async function findMarker(sheets: sheets_v4.Sheets, target: SheetTarget, reservation: Reservation): Promise<boolean> {
  let marker: sheets_v4.Schema$DeveloperMetadata;
  try {
    const response = await sheets.spreadsheets.developerMetadata.get({
      spreadsheetId: target.spreadsheetId, metadataId: reservation.metadata_id,
    }, REQUEST_OPTIONS);
    marker = response.data;
  } catch (error) {
    const failure = error as { code?: unknown; response?: { status?: unknown } };
    if (Number(failure.response?.status || failure.code) === 404) return false;
    throw error;
  }
  const location = marker.location?.dimensionRange;
  if (marker.metadataKey !== METADATA_KEY || marker.metadataValue !== `lead:${reservation.lead_id}`
    || location?.sheetId !== target.sheetId || location.dimension !== "ROWS"
    || location.startIndex !== reservation.row_number - 1 || location.endIndex !== reservation.row_number) {
    throw new SheetsExportError(409, "転記先の行または転記記録が変更されています。上書きを避けるため処理を停止しました");
  }
  return true;
}

function exportRequests(target: SheetTarget, reservation: Reservation): sheets_v4.Schema$Request[] {
  const payload = reservation.payload;
  if (payload?.version !== 1) throw new SheetsExportError(409, "保存済みの転記情報を確認できません。管理者にご確認ください");
  const text = (value: string): sheets_v4.Schema$CellData => ({ userEnteredValue: { stringValue: value } });
  const date: sheets_v4.Schema$CellData = { userEnteredValue: payload.meetingDateSerial === null
    ? { stringValue: "" } : { numberValue: payload.meetingDateSerial } };
  const cells = [text(payload.companyName), text(payload.companyWebsite), text(payload.position),
    text(payload.contactPerson), text(payload.assignedPerson), date];
  const update = (column: number, values: sheets_v4.Schema$CellData[]): sheets_v4.Schema$Request => ({
    updateCells: {
      start: { sheetId: target.sheetId, rowIndex: reservation.row_number - 1, columnIndex: column },
      rows: [{ values }], fields: "userEnteredValue",
    },
  });
  // A single atomic batch preserves fixed D cells, H checkboxes, and all formatting.
  return [
    ...(target.skipPosition ? [update(1, cells.slice(0, 2)), update(4, cells.slice(3))] : [update(1, cells)]),
    { createDeveloperMetadata: { developerMetadata: {
      metadataId: reservation.metadata_id, metadataKey: METADATA_KEY,
      metadataValue: `lead:${reservation.lead_id}`, visibility: "DOCUMENT",
      location: { dimensionRange: { sheetId: target.sheetId, dimension: "ROWS",
        startIndex: reservation.row_number - 1, endIndex: reservation.row_number } },
    } } },
  ];
}

export function createSheetExportService(dependencies: Dependencies) {
  const database = dependencies.pool;
  const markSucceeded = async (reservation: Reservation) => {
    await database.query("UPDATE lead_sheet_exports SET status = 'succeeded', updated_at = now() WHERE lead_id = $1 AND spreadsheet_id = $2",
      [reservation.lead_id, reservation.spreadsheet_id]);
  };
  const result = (target: SheetTarget, reservation: Reservation, alreadyExported: boolean): ExportResult => ({
    alreadyExported, rowNumber: reservation.row_number, supporterName: target.supporterName,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${target.spreadsheetId}/edit#gid=${target.sheetId}&range=B${reservation.row_number}:G${reservation.row_number}`,
  });

  return async function exportLeadToSheet(lead: Lead, supporterName: string): Promise<ExportResult> {
    const target = getSheetTarget(supporterName);
    if (!target) throw new SheetsExportError(400, "シート入力に該当しない企業です");
    if (!Number.isSafeInteger(lead.id) || lead.id <= 0) throw new SheetsExportError(400, "商談を確認できません");
    // Authentication setup errors remain available to the route's auth handler.
    const sheets = await dependencies.getSheetsClient();
    try {
      const rowCount = await verifyTemplate(sheets, target);
      const client = await database.connect();
      let reservation: Reservation;
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`growth_park_sheet_export:${target.spreadsheetId}`]);
        const existing = await client.query("SELECT * FROM lead_sheet_exports WHERE lead_id = $1 AND spreadsheet_id = $2 FOR UPDATE", [lead.id, target.spreadsheetId]);
        if (existing.rows[0]) {
          reservation = existing.rows[0];
        } else {
          const lastBusinessRow = await findLastBusinessRow(sheets, target, rowCount);
          const maximums = await client.query("SELECT COALESCE(MAX(row_number), $2::integer) AS max_row, COALESCE(MAX(metadata_id), 1000000000) AS max_metadata FROM lead_sheet_exports WHERE spreadsheet_id = $1", [target.spreadsheetId, target.startRow - 1]);
          const row = Math.max(target.startRow, lastBusinessRow + 1, Number(maximums.rows[0].max_row) + 1);
          const metadataId = Number(maximums.rows[0].max_metadata) + 1;
          if (row > rowCount) throw new SheetsExportError(409, "転記先に空き行がありません。シートの行を追加してから再度お試しください");
          if (metadataId > 2147483647) throw new SheetsExportError(409, "転記記録の上限に達しました。管理者にご確認ください");
          const saved = await client.query("INSERT INTO lead_sheet_exports (lead_id, spreadsheet_id, sheet_id, row_number, metadata_id, payload, status) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'pending') RETURNING *",
            [lead.id, target.spreadsheetId, target.sheetId, row, metadataId, JSON.stringify(snapshot(lead))]);
          reservation = saved.rows[0];
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      if (reservation.sheet_id !== target.sheetId || reservation.row_number < target.startRow || reservation.row_number > rowCount) {
        throw new SheetsExportError(409, "転記先の行が変更されています。管理者にご確認ください");
      }
      if (await findMarker(sheets, target, reservation)) {
        await markSucceeded(reservation);
        return result(target, reservation, true);
      }
      if (reservation.status === "succeeded") {
        throw new SheetsExportError(409, "転記済みの行を確認できません。重複を避けるため再転記を停止しました");
      }
      // Re-read the exact reserved row immediately before writing. Never replace
      // manually entered data, even if a previous request has an uncertain result.
      const current = await sheets.spreadsheets.values.get({
        spreadsheetId: target.spreadsheetId,
        range: a1(target, `B${reservation.row_number}:G${reservation.row_number}`), valueRenderOption: "FORMULA",
      }, REQUEST_OPTIONS);
      if (businessRowOccupied(current.data.values?.[0] || [], target)) {
        // A simultaneous identical request may just have completed after our lookup.
        if (await findMarker(sheets, target, reservation)) {
          await markSucceeded(reservation);
          return result(target, reservation, true);
        }
        throw new SheetsExportError(409, "転記予定の行に入力があります。上書きを避けるため処理を停止しました");
      }
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: target.spreadsheetId, requestBody: { requests: exportRequests(target, reservation) },
        }, REQUEST_OPTIONS);
      } catch (error) {
        // The row and marker were in one atomic Google request. A lost response
        // or duplicate-marker rejection can be recovered without appending again.
        try {
          if (await findMarker(sheets, target, reservation)) {
            await markSucceeded(reservation);
            return result(target, reservation, true);
          }
        } catch (lookupError) {
          if (lookupError instanceof SheetsExportError) throw lookupError;
        }
        await database.query("UPDATE lead_sheet_exports SET status = 'uncertain', updated_at = now() WHERE lead_id = $1 AND spreadsheet_id = $2 AND status <> 'succeeded'", [lead.id, target.spreadsheetId]);
        throw error;
      }
      await markSucceeded(reservation);
      return result(target, reservation, false);
    } catch (error) {
      // Do not log or return Google error objects; they can contain credentials and cells.
      throw safeFailure(error);
    }
  };
}

export const exportLeadToSheet = createSheetExportService({ pool, getSheetsClient });
