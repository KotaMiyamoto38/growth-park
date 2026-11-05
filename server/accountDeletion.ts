import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  users,
  leads,
  meetingReports,
  contracts,
  notifications,
  passwordResetTokens,
  connectorCompanies,
} from "@shared/schema";

export class AccountDeletionConflictError extends Error {
  constructor() {
    super("商談・商談報告・契約が紐づいているため、アカウントを削除できません。管理者へ権限変更またはデータの引き継ぎをご相談ください。");
    this.name = "AccountDeletionConflictError";
  }
}

/** Delete login data only when shared business records can be preserved. */
export async function deleteAccount<
  TResult extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(database: PgDatabase<TResult, TSchema>, userId: number): Promise<void> {
  await database.transaction(async (tx) => {
    // A concurrent foreign-key reference cannot be inserted while this row is locked.
    const [user] = await tx.select({ id: users.id }).from(users)
      .where(eq(users.id, userId)).for("update");
    if (!user) return;

    const [lead] = await tx.select({ id: leads.id }).from(leads)
      .where(eq(leads.connectorId, userId)).limit(1);
    const [report] = await tx.select({ id: meetingReports.id }).from(meetingReports)
      .where(eq(meetingReports.connectorId, userId)).limit(1);
    const [contract] = await tx.select({ id: contracts.id }).from(contracts)
      .where(eq(contracts.addboxMemberId, userId)).limit(1);
    if (lead || report || contract) throw new AccountDeletionConflictError();

    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await tx.update(notifications).set({ connectorId: null })
      .where(eq(notifications.connectorId, userId));
    await tx.update(connectorCompanies)
      .set({ representativeId: null, updatedAt: new Date() })
      .where(eq(connectorCompanies.representativeId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
}
