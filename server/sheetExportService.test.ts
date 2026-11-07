import assert from "node:assert/strict";
import { test } from "node:test";
import type { Lead } from "@shared/schema";
import { SHEET_TARGETS, getSheetTarget } from "@shared/sheetTargets";

process.env.NEON_DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const { createSheetExportService, SheetsExportError } = await import("./sheetExportService");

const lead = (id = 10): Lead => ({
  id, connectorId: 1, supporterId: 2, companyName: "転記する企業", companyWebsite: "https://example.com",
  businessContent: "外部送信しない内容", position: "営業部長", contactPerson: "顧客担当者",
  contactInfo: "PRIVATE", meetingFee: 99999, status: "日程確定", assignedPerson: "宮本",
  assignedPersonSub: null, needs: "PRIVATE", source: "そのほか", meetingDate: new Date("2026-11-07T06:30:00.000Z"),
  dealLinkContact: null, dealLinkUrl: null, createdAt: new Date(), updatedAt: new Date(),
});

function fixture(target = SHEET_TARGETS[0]) {
  const reservations = new Map<string, any>();
  const rows = new Map<number, unknown[]>();
  const markers = new Map<number, any>();
  const attempts: any[] = [];
  const applied: any[] = [];
  const sql: string[] = [];
  let lockTail = Promise.resolve();
  let mode: "before" | "after" | "delayed" | null = null;
  let delayedRequest: any;
  let authCalls = 0;
  let headers = ["企業名", "HP", "役職", "担当者", "担当者", "商談日"];
  let rowCount = 20;
  const clone = <T>(value: T): T => structuredClone(value);
  const key = (id: number, spreadsheet: string) => `${spreadsheet}:${id}`;
  const execute = async (statement: string, args: any[] = []) => {
    sql.push(statement);
    if (statement.startsWith("SELECT * FROM")) return { rows: reservations.has(key(args[0], args[1])) ? [clone(reservations.get(key(args[0], args[1])))] : [] };
    if (statement.startsWith("SELECT COALESCE")) {
      const entries = [...reservations.values()].filter(r => r.spreadsheet_id === args[0]);
      return { rows: [{ max_row: Math.max(args[1], ...entries.map(r => r.row_number)), max_metadata: Math.max(1000000000, ...entries.map(r => r.metadata_id)) }] };
    }
    if (statement.startsWith("INSERT INTO")) {
      const [lead_id, spreadsheet_id, sheet_id, row_number, metadata_id, payload] = args;
      if ([...reservations.values()].some(r => r.spreadsheet_id === spreadsheet_id
        && (r.lead_id === lead_id || r.row_number === row_number || r.metadata_id === metadata_id))) {
        throw { code: "23505" };
      }
      const record = { lead_id, spreadsheet_id, sheet_id, row_number, metadata_id, payload: JSON.parse(payload), status: "pending" };
      reservations.set(key(lead_id, spreadsheet_id), record);
      return { rows: [clone(record)] };
    }
    if (statement.startsWith("UPDATE")) {
      const record = reservations.get(key(args[0], args[1]));
      if (statement.includes("status = 'succeeded'")) record.status = "succeeded";
      else if (record.status !== "succeeded") record.status = "uncertain";
      return { rows: [] };
    }
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(statement)) return { rows: [] };
    throw new Error(`Unhandled SQL: ${statement}`);
  };
  const database = {
    query: execute,
    async connect() {
      let unlock: (() => void) | undefined;
      return {
        async query(statement: string, args?: any[]) {
          if (statement.includes("pg_advisory_xact_lock")) {
            sql.push(statement);
            const before = lockTail;
            lockTail = new Promise<void>(resolve => { unlock = resolve; });
            await before;
            return { rows: [] };
          }
          const result = await execute(statement, args);
          if (statement === "COMMIT" || statement === "ROLLBACK") { unlock?.(); unlock = undefined; }
          return result;
        },
        release() { unlock?.(); },
      };
    },
  };
  const valuesAt = (row: number) => rows.get(row) || (target.skipPosition ? ["", "", "代表取締役", "", "", ""] : []);
  const apply = (request: any) => {
    const marker = request.requestBody.requests.find((r: any) => r.createDeveloperMetadata).createDeveloperMetadata.developerMetadata;
    // Mirror Sheets atomic validation: duplicate metadata rejects all cell updates.
    if (markers.has(marker.metadataId)) throw { code: 400, message: "already exists SECRET" };
    for (const item of request.requestBody.requests) {
      if (!item.updateCells) continue;
      const update = item.updateCells;
      const row = update.start.rowIndex + 1;
      const values = [...valuesAt(row)];
      update.rows[0].values.forEach((cell: any, index: number) => {
        values[update.start.columnIndex - 1 + index] = cell.userEnteredValue.stringValue ?? cell.userEnteredValue.numberValue;
      });
      rows.set(row, values);
    }
    markers.set(marker.metadataId, clone(marker));
    applied.push(clone(request));
  };
  const sheets = {
    spreadsheets: {
      async get() { return { data: { sheets: [{ properties: { sheetId: 0, title: "シート1", gridProperties: { rowCount, columnCount: 22 } } }] } }; },
      values: {
        async get(request: any) {
          if (request.range.endsWith("B3:G3")) return { data: { values: [headers] } };
          const match = /!B(\d+):G(\d+)$/.exec(request.range)!;
          const start = Number(match[1]), end = Number(match[2]);
          return { data: { values: Array.from({ length: end - start + 1 }, (_, index) => clone(valuesAt(start + index))) } };
        },
      },
      developerMetadata: {
        async get(request: any) {
          if (!markers.has(request.metadataId)) throw { response: { status: 404 } };
          return { data: clone(markers.get(request.metadataId)) };
        },
      },
      async batchUpdate(request: any, options: any) {
        assert.equal(options.retry, false);
        attempts.push(clone(request));
        const failure = mode;
        mode = null;
        if (failure === "before") throw { code: "ETIMEDOUT", token: "SECRET", message: "PRIVATE" };
        if (failure === "delayed") {
          delayedRequest = clone(request);
          throw { code: "ETIMEDOUT" };
        }
        if (delayedRequest) { apply(delayedRequest); delayedRequest = undefined; }
        apply(request);
        if (failure === "after") throw { code: "ETIMEDOUT" };
        return { data: { replies: [] } };
      },
    },
  };
  const run = createSheetExportService({ pool: database, getSheetsClient: async () => { authCalls++; return sheets as any; } });
  return {
    run: (record = lead(), supporterName = target.supporterName) => run(record, supporterName),
    rows, reservations, markers, attempts, applied, sql,
    failNext: (value: typeof mode) => { mode = value; },
    changeHeaders: () => { headers = [...headers.slice(0, 4), "別の列", "商談日"]; },
    setRowCount: (value: number) => { rowCount = value; },
    getAuthCalls: () => authCalls,
  };
}

test("fixed destinations use exact normalized company names and reject unrelated supporters before auth", async () => {
  assert.equal(getSheetTarget(" 株式会社Ｔｈｉｎｋ　ＵＰ ")?.spreadsheetId, SHEET_TARGETS[0].spreadsheetId);
  assert.equal(getSheetTarget("Ａｃｒｏｆｏｒｃｅ株式会社")?.spreadsheetId, SHEET_TARGETS[1].spreadsheetId);
  const f = fixture();
  for (const name of ["株式会社Think UP子会社", "Think UP株式会社", "別会社", ""]) {
    await assert.rejects(f.run(lead(), name), (error: any) => error instanceof SheetsExportError && error.status === 400 && error.message === "シート入力に該当しない企業です");
  }
  assert.equal(f.getAuthCalls(), 0);
});

test("Think UP begins at 14, preserves role/checkbox/format, and safely writes the two distinct contacts and JST datetime", async () => {
  const f = fixture();
  const source = { ...lead(), companyName: '=IMPORTXML("https://evil.invalid")' };
  const first = await f.run(source);
  assert.equal(first.rowNumber, 14);
  assert.equal(first.alreadyExported, false);
  assert.match(first.spreadsheetUrl, /gid=0&range=B14:G14$/);
  const updates = f.applied[0].requestBody.requests.filter((r: any) => r.updateCells).map((r: any) => r.updateCells);
  assert.deepEqual(updates.map((r: any) => [r.start.columnIndex, r.rows[0].values.length, r.fields]), [[1, 2, "userEnteredValue"], [4, 3, "userEnteredValue"]]);
  assert.equal(updates[0].rows[0].values[0].userEnteredValue.stringValue, source.companyName);
  assert.deepEqual(f.rows.get(14)?.slice(2, 5), ["代表取締役", "顧客担当者", "宮本"]);
  assert.ok(Math.abs(Number(f.rows.get(14)?.[5]) - (Date.UTC(2026, 10, 7, 15, 30) / 86400000 + 25569)) < 1e-8);
  assert.doesNotMatch(JSON.stringify(f.applied), /PRIVATE|99999|外部送信しない|formulaValue|userEnteredFormat/);
  const again = await f.run(source);
  assert.equal(again.alreadyExported, true);
  assert.equal(again.rowNumber, 14);
  assert.equal(f.applied.length, 1);
  assert.equal((await f.run(lead(11))).rowNumber, 15);
});

test("Acroforce begins at 4 and writes position while leaving H and formatting untouched", async () => {
  const f = fixture(SHEET_TARGETS[1]);
  assert.equal((await f.run()).rowNumber, 4);
  assert.deepEqual(f.rows.get(4)?.slice(0, 5), ["転記する企業", "https://example.com", "営業部長", "顧客担当者", "宮本"]);
  const update = f.applied[0].requestBody.requests[0].updateCells;
  assert.equal(update.start.columnIndex, 1);
  assert.equal(update.rows[0].values.length, 6);
  assert.equal(update.fields, "userEnteredValue");
  assert.equal((await f.run({ ...lead(11), meetingDate: null })).rowNumber, 5);
  assert.equal(f.rows.get(5)?.[5], "");
});

test("concurrent clicks reserve distinct rows and duplicate clicks write once", async () => {
  const f = fixture();
  const results = await Promise.all([f.run(lead(10)), f.run(lead(10)), f.run(lead(11))]);
  assert.deepEqual(results.map(r => r.rowNumber), [14, 14, 15]);
  assert.equal(f.applied.length, 2);
  assert.equal(f.reservations.size, 2);
  assert.equal(f.sql.filter(s => s.includes("pg_advisory_xact_lock")).length, 3);
});

test("lost successful response is recovered by its atomic metadata without another row", async () => {
  const f = fixture();
  f.failNext("after");
  assert.equal((await f.run()).rowNumber, 14);
  assert.equal((await f.run()).alreadyExported, true);
  assert.equal(f.applied.length, 1);
  assert.equal([...f.reservations.values()][0].status, "succeeded");
});

test("unknown result keeps the row, metadata ID and payload snapshot across retries and late arrival", async () => {
  const f = fixture();
  f.failNext("delayed");
  await assert.rejects(f.run(), (error: any) => error.status === 502 && !/SECRET|PRIVATE|ETIMEDOUT/.test(error.message));
  assert.equal([...f.reservations.values()][0].status, "uncertain");
  assert.equal((await f.run(lead(11))).rowNumber, 15);
  const retried = await f.run({ ...lead(), companyName: "後から変更した企業" });
  assert.equal(retried.rowNumber, 14);
  assert.equal(retried.alreadyExported, true);
  assert.equal(f.rows.get(14)?.[0], "転記する企業");
  assert.equal(f.applied.length, 2);
});

test("unwritten timeout retries the original snapshot at its original row", async () => {
  const f = fixture();
  f.failNext("before");
  await assert.rejects(f.run(), (error: any) => error.status === 502);
  const retry = await f.run({ ...lead(), position: "変更後", contactPerson: "変更後" });
  assert.equal(retry.rowNumber, 14);
  assert.equal(f.rows.get(14)?.[3], "顧客担当者");
  assert.equal(f.attempts[0].requestBody.requests.at(-1).createDeveloperMetadata.developerMetadata.metadataId,
    f.attempts[1].requestBody.requests.at(-1).createDeveloperMetadata.developerMetadata.metadataId);
  assert.equal(f.applied.length, 1);
});

test("existing rows are skipped, but a manually occupied reservation fails closed", async () => {
  const f = fixture();
  f.rows.set(16, ["手入力済み企業"]);
  f.failNext("before");
  await assert.rejects(f.run(), (error: any) => error.status === 502);
  assert.equal([...f.reservations.values()][0].row_number, 17);
  f.rows.set(17, ["別の手入力"]);
  await assert.rejects(f.run(), (error: any) => error.status === 409);
  assert.deepEqual(f.rows.get(16), ["手入力済み企業"]);
  assert.deepEqual(f.rows.get(17), ["別の手入力"]);
  assert.equal(f.attempts.length, 1);
});

test("missing or moved successful metadata never causes a second export", async () => {
  const f = fixture();
  await f.run();
  const marker = [...f.markers.values()][0];
  marker.location.dimensionRange.startIndex = 14;
  marker.location.dimensionRange.endIndex = 15;
  await assert.rejects(f.run(), (error: any) => error.status === 409);
  f.markers.clear();
  await assert.rejects(f.run(), (error: any) => error.status === 409);
  assert.equal(f.applied.length, 1);
});

test("changed headers, exhausted sheet and invalid dates never write", async () => {
  const changed = fixture();
  changed.changeHeaders();
  await assert.rejects(changed.run(), (error: any) => error.status === 409);
  assert.equal(changed.reservations.size, 0);
  const full = fixture();
  full.setRowCount(14);
  full.rows.set(14, ["末尾に入力あり"]);
  await assert.rejects(full.run(), (error: any) => error.status === 409);
  const invalid = fixture();
  await assert.rejects(invalid.run({ ...lead(), meetingDate: new Date("invalid") }), (error: any) => error.status === 400);
  assert.equal(changed.applied.length + full.applied.length + invalid.applied.length, 0);
});
