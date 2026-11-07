// Isolated PostgreSQL tests; never loads server/db or production credentials.
// PGlite is a development-only dependency for these isolated database tests.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { InsertLead } from "@shared/schema";
import { createLeadWithMonthlyCount, ensureLeadMonthlyCounters, getJstRegistrationMonth } from "./leadMonthlyCount";

const input = (connectorId = 1): InsertLead => ({
  connectorId, companyName: "登録企業", businessContent: "事業内容", contactPerson: "お名前", source: "そのほか",
});
const at = (iso: string) => () => new Date(iso);

async function setup() {
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE users (id integer PRIMARY KEY);
    INSERT INTO users VALUES (1), (2);
    CREATE TABLE leads (
      id serial PRIMARY KEY, connector_id integer NOT NULL REFERENCES users(id), supporter_id integer,
      company_name text NOT NULL, company_website text, business_content text NOT NULL, position text,
      contact_person text NOT NULL, contact_info text, meeting_fee integer, status text NOT NULL DEFAULT '進行中',
      assigned_person text, assigned_person_sub text, needs text, source text NOT NULL,
      meeting_date timestamp, deal_link_contact text, deal_link_url text,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
    );
  `);
  return { client, database: drizzle(client) };
}

async function seed(client: PGlite, connectorId: number, createdAt: string, meetingDate?: string) {
  await client.query(`INSERT INTO leads
    (connector_id, company_name, business_content, contact_person, source, created_at, meeting_date)
    VALUES ($1, '既存企業', '既存事業', '既存担当者', 'そのほか', $2, $3)`,
  [connectorId, createdAt, meetingDate || null]);
}

async function totals(client: PGlite) {
  return (await client.query(`SELECT connector_id, registration_month::text, registration_count
    FROM lead_monthly_counters ORDER BY connector_id, registration_month`)).rows;
}

test("registration months use JST midnight with an exclusive next-month boundary", () => {
  assert.equal(getJstRegistrationMonth(new Date("2026-10-31T14:59:59.999Z")).month, "2026-10-01");
  const november = getJstRegistrationMonth(new Date("2026-10-31T15:00:00.000Z"));
  assert.equal(november.month, "2026-11-01");
  assert.equal(november.start.toISOString(), "2026-10-31T15:00:00.000Z");
  assert.equal(november.end.toISOString(), "2026-11-30T15:00:00.000Z");
  assert.equal(getJstRegistrationMonth(new Date("2026-12-31T15:00:00.000Z")).month, "2027-01-01");
  assert.throws(() => getJstRegistrationMonth(new Date("invalid")));
});

test("first registration includes existing records for the same introducer and JST month, irrespective of meeting dates", async () => {
  const { client, database } = await setup();
  try {
    await seed(client, 1, "2026-10-31 14:59:59.999", "2026-11-07"); // Previous JST month.
    await seed(client, 1, "2026-10-31 15:00:00", "2026-10-10"); // First instant in November.
    await seed(client, 1, "2026-11-05 02:00:00", "2026-12-20");
    await seed(client, 1, "2026-11-30 15:00:00", "2026-11-07"); // Next JST month.
    await seed(client, 2, "2026-11-05 02:00:00", "2026-11-07");
    const lead = await createLeadWithMonthlyCount(database, {
      ...input(), assignedPerson: "阿久津", meetingDate: new Date("2027-01-01T00:00:00Z"),
    }, at("2026-11-07T03:00:00Z"));
    assert.equal(lead.monthlyLeadCount, 3);
    assert.equal(lead.createdAt.toISOString(), "2026-11-07T03:00:00.000Z");
    assert.deepEqual(await totals(client), [{ connector_id: 1, registration_month: "2026-11-01", registration_count: 3 }]);
    const other = await createLeadWithMonthlyCount(database, { ...input(2), assignedPerson: "阿久津" }, at("2026-11-07T03:00:00Z"));
    assert.equal(other.monthlyLeadCount, 2);
  } finally { await client.close(); }
});

test("one existing November lead yields number two and December starts a separate total", async () => {
  const { client, database } = await setup();
  try {
    await seed(client, 1, "2026-11-01 01:00:00");
    const november = await createLeadWithMonthlyCount(database, input(), at("2026-11-30T14:59:59.999Z"));
    const december = await createLeadWithMonthlyCount(database, input(), at("2026-11-30T15:00:00.000Z"));
    assert.equal(november.monthlyLeadCount, 2);
    assert.equal(december.monthlyLeadCount, 1);
    assert.deepEqual(await totals(client), [
      { connector_id: 1, registration_month: "2026-11-01", registration_count: 2 },
      { connector_id: 1, registration_month: "2026-12-01", registration_count: 1 },
    ]);
  } finally { await client.close(); }
});

test("simultaneous registrations produce independent consecutive totals for each introducer", async () => {
  const { client, database } = await setup();
  try {
    await seed(client, 1, "2026-11-01 01:00:00");
    // PGlite serializes database transactions; these overlapping application calls
    // still exercise the same PostgreSQL lock, statements and unique key as production.
    const created = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      createLeadWithMonthlyCount(database, input(index % 2 + 1), at("2026-11-07T03:00:00Z"))));
    assert.deepEqual(created.filter(lead => lead.connectorId === 1).map(lead => lead.monthlyLeadCount).sort((a, b) => a - b), [2, 3, 4, 5, 6, 7]);
    assert.deepEqual(created.filter(lead => lead.connectorId === 2).map(lead => lead.monthlyLeadCount).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
    assert.equal(new Set(created.map(lead => lead.id)).size, 12);
  } finally { await client.close(); }
});

test("deleting all leads and reopening storage preserves the next number", async () => {
  const { client, database } = await setup();
  try {
    await seed(client, 1, "2026-11-01 01:00:00");
    assert.equal((await createLeadWithMonthlyCount(database, input(), at("2026-11-07T03:00:00Z"))).monthlyLeadCount, 2);
    await client.exec("DELETE FROM leads");
    const reopened = drizzle(client);
    const lead = await createLeadWithMonthlyCount(reopened, input(), at("2026-11-08T03:00:00Z"));
    assert.equal(lead.monthlyLeadCount, 3);
    assert.deepEqual(await totals(client), [{ connector_id: 1, registration_month: "2026-11-01", registration_count: 3 }]);
  } finally { await client.close(); }
});

test("lead insertion and counter failure roll back together without consuming a number", async () => {
  const { client, database } = await setup();
  try {
    await assert.rejects(createLeadWithMonthlyCount(database, input(999), at("2026-11-07T03:00:00Z")));
    assert.deepEqual(await totals(client), []);
    assert.equal((await createLeadWithMonthlyCount(database, input(), at("2026-11-07T03:00:00Z"))).monthlyLeadCount, 1);
    await client.exec(`CREATE FUNCTION reject_counter_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test counter failure'; END; $$;
      CREATE TRIGGER reject_counter_update BEFORE UPDATE ON lead_monthly_counters
      FOR EACH ROW EXECUTE FUNCTION reject_counter_update();`);
    await assert.rejects(createLeadWithMonthlyCount(database, input(), at("2026-11-07T03:00:00Z")));
    assert.equal((await client.query<{ count: number }>("SELECT count(*)::integer AS count FROM leads")).rows[0].count, 1);
    assert.deepEqual(await totals(client), [{ connector_id: 1, registration_month: "2026-11-01", registration_count: 1 }]);
    await client.exec("DROP TRIGGER reject_counter_update ON lead_monthly_counters");
    assert.equal((await createLeadWithMonthlyCount(database, input(), at("2026-11-07T03:00:00Z"))).monthlyLeadCount, 2);
  } finally { await client.close(); }
});

test("registrations made outside the new counter are included on the next save", async () => {
  const { client, database } = await setup();
  try {
    assert.equal((await createLeadWithMonthlyCount(database, input(), at("2026-11-07T03:00:00Z"))).monthlyLeadCount, 1);
    await seed(client, 1, "2026-11-07 04:00:00");
    await seed(client, 1, "2026-11-07 05:00:00");
    await seed(client, 1, "2026-11-07 06:00:00");
    assert.equal((await createLeadWithMonthlyCount(database, input(), at("2026-11-07T07:00:00Z"))).monthlyLeadCount, 5);
    assert.equal((await createLeadWithMonthlyCount(database, input(), at("2026-11-07T08:00:00Z"))).monthlyLeadCount, 6);
    await client.exec("DELETE FROM leads");
    assert.equal((await createLeadWithMonthlyCount(database, input(), at("2026-11-07T09:00:00Z"))).monthlyLeadCount, 7);
  } finally { await client.close(); }
});

test("UTC registration storage does not depend on database timezone or client-supplied timestamps", async () => {
  const { client, database } = await setup();
  try {
    await client.exec("SET TIME ZONE 'Pacific/Honolulu'");
    await Promise.all([ensureLeadMonthlyCounters(database), ensureLeadMonthlyCounters(database)]);
    const lead = await createLeadWithMonthlyCount(database, {
      ...input(), createdAt: new Date("1999-01-01T00:00:00Z"), monthlyLeadCount: 99,
    } as InsertLead, at("2026-10-31T15:00:00Z"));
    assert.equal(lead.createdAt.toISOString(), "2026-10-31T15:00:00.000Z");
    assert.equal(lead.monthlyLeadCount, 1);
    assert.deepEqual(await totals(client), [{ connector_id: 1, registration_month: "2026-11-01", registration_count: 1 }]);
  } finally { await client.close(); }
});
