import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { leadMonthlyCounters, leads, type CreatedLead, type InsertLead } from "@shared/schema";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const REGISTRATION_LOCK_NAMESPACE = 1196444739;
const setupByDatabase = new WeakMap<object, Promise<void>>();

export function getJstRegistrationMonth(registeredAt: Date) {
  if (!Number.isFinite(registeredAt.getTime())) throw new Error("Invalid registration timestamp");
  const local = new Date(registeredAt.getTime() + JST_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return {
    month: `${local.toISOString().slice(0, 7)}-01`,
    start: new Date(Date.UTC(year, month, 1) - JST_OFFSET_MS),
    end: new Date(Date.UTC(year, month + 1, 1) - JST_OFFSET_MS),
  };
}

// Lazy, additive setup. The database lock also serializes first use across
// application instances, where CREATE TABLE IF NOT EXISTS alone can race.
export function ensureLeadMonthlyCounters<
  TResult extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(database: PgDatabase<TResult, TSchema>): Promise<void> {
  const existing = setupByDatabase.get(database);
  if (existing) return existing;
  const setup = database.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${REGISTRATION_LOCK_NAMESPACE}, 0)`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS lead_monthly_counters (
      connector_id integer NOT NULL,
      registration_month date NOT NULL,
      registration_count integer NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT lead_monthly_counters_pkey PRIMARY KEY (connector_id, registration_month),
      CONSTRAINT lead_monthly_counters_nonnegative CHECK (registration_count >= 0)
    )`);
  }).catch(error => {
    setupByDatabase.delete(database);
    throw error;
  });
  setupByDatabase.set(database, setup);
  return setup;
}

export async function createLeadWithMonthlyCount<
  TResult extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(database: PgDatabase<TResult, TSchema>, insertLead: InsertLead,
  clock: () => Date = () => new Date()): Promise<CreatedLead> {
  await ensureLeadMonthlyCounters(database);
  return database.transaction(async tx => {
    // Every creation route uses this lock before inserting. Acquire it before
    // taking the timestamp so a wait across midnight uses the actual save month.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${REGISTRATION_LOCK_NAMESPACE}, ${insertLead.connectorId})`);
    const registeredAt = clock();
    const period = getJstRegistrationMonth(registeredAt);
    const [lead] = await tx.insert(leads).values({
      ...insertLead,
      // Existing timestamp-without-time-zone values are read as UTC by Drizzle.
      // Supply UTC explicitly, independently of the database/server timezone.
      createdAt: registeredAt,
      updatedAt: registeredAt,
    }).returning();

    const [current] = await tx.select({ count: sql<number>`count(*)::integer` }).from(leads)
      .where(and(eq(leads.connectorId, lead.connectorId), gte(leads.createdAt, period.start),
        lt(leads.createdAt, period.end)));
    const key = and(eq(leadMonthlyCounters.connectorId, lead.connectorId),
      eq(leadMonthlyCounters.registrationMonth, period.month));
    const [existing] = await tx.select({ count: leadMonthlyCounters.registrationCount })
      .from(leadMonthlyCounters).where(key);
    let monthlyLeadCount: number;
    if (existing) {
      const [updated] = await tx.update(leadMonthlyCounters).set({
        // Catch up with live records added by an older application instance or
        // import, while preserving the high-water mark after record deletion.
        registrationCount: sql`greatest(${leadMonthlyCounters.registrationCount} + 1, ${current.count})`,
        updatedAt: registeredAt,
      }).where(key).returning({ count: leadMonthlyCounters.registrationCount });
      monthlyLeadCount = updated.count;
    } else {
      // The first saved total includes older records and the lead just inserted.
      // Once initialized, deleting a lead never decrements/reuses its number.
      const [created] = await tx.insert(leadMonthlyCounters).values({
        connectorId: lead.connectorId, registrationMonth: period.month,
        registrationCount: current.count, updatedAt: registeredAt,
      }).returning({ count: leadMonthlyCounters.registrationCount });
      monthlyLeadCount = created.count;
    }
    // A counter failure rolls the lead insertion back in the same transaction.
    return { ...lead, monthlyLeadCount };
  });
}
