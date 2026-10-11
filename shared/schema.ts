import { pgTable, text, serial, integer, boolean, timestamp, decimal, pgEnum, varchar, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["AddBox", "Connector", "Supporter", "Client"]);
export const leadStatusEnum = pgEnum("lead_status", ["進行中", "日程確定", "商談実施済み", "失注"]);
export const assignedPersonEnum = pgEnum("assigned_person", ["森尾", "宮本", "林", "福嶋", "芝本", "棗", "浜野", "阿久津"]);
export const meetingOutcomeEnum = pgEnum("meeting_outcome", ["予定", "実施済み", "キャンセル"]);
export const supporterStatusEnum = pgEnum("supporter_status", ["アクティブ", "ストップ"]);
export const contractCommissionEnum = pgEnum("contract_commission", ["一律80%", "一律70%", "3件まで70%で3件から80%", "5件まで70%で6件から80%"]);
export const leadSourceEnum = pgEnum("lead_source", ["リファラル", "交流会", "テレアポ", "SNS", "そのほか"]);

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull(),
  companyName: text("company_name"),
  companyWebsite: text("company_website"),
  industry: text("industry"),
  address: text("address"),
  connectorCompanyId: integer("connector_company_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Connector companies table
export const connectorCompanies = pgTable("connector_companies", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  companyWebsite: text("company_website"),
  industry: text("industry"),
  address: text("address"),
  representativeId: integer("representative_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Supporters table
export const supporters = pgTable("supporters", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  companyUrl: text("company_url"),
  logoUrl: text("logo_url"),
  serviceName: text("service_name").notNull(),
  serviceUrl: text("service_url"),
  servicePrice: text("service_price"),
  serviceOverview: text("service_overview").notNull(),
  status: supporterStatusEnum("status").notNull().default("アクティブ"),
  targetCompanySize: text("target_company_size"),
  targetAttributes: text("target_attributes"),
  targetOthers: text("target_others"),
  addboxFee: integer("addbox_fee"),
  connectorFee: integer("connector_fee"),
  attachmentPath: text("attachment_path"),
  attachmentName: text("attachment_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Leads table
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  connectorId: integer("connector_id").notNull().references(() => users.id),
  supporterId: integer("supporter_id").references(() => supporters.id),
  companyName: text("company_name").notNull(),
  companyWebsite: text("company_website"),
  businessContent: text("business_content").notNull(),
  position: text("position"),
  contactPerson: text("contact_person").notNull(),
  contactInfo: text("contact_info"),
  meetingFee: integer("meeting_fee"),
  status: leadStatusEnum("status").notNull().default("進行中"),
  assignedPerson: text("assigned_person"),
  assignedPersonSub: text("assigned_person_sub"),
  needs: text("needs"),
  source: leadSourceEnum("source").notNull(),
  meetingDate: timestamp("meeting_date"),
  dealLinkContact: text("deal_link_contact"),
  dealLinkUrl: text("deal_link_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Meetings table
export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  supporterId: integer("supporter_id"),
  scheduledDate: timestamp("scheduled_date"),
  locationOrLink: text("location_or_link"),
  outcome: meetingOutcomeEnum("outcome").notNull().default("予定"),
  attendanceRequired: boolean("attendance_required").default(false),
  addboxFee: text("addbox_fee"),
  connectorFee: text("connector_fee"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Contracts table
export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  connectorCompanyId: integer("connector_company_id").notNull(),
  signedDate: timestamp("signed_date").notNull(),
  representativeName: text("representative_name").notNull(),
  commissionRate: contractCommissionEnum("commission_rate").notNull(),
  addboxMemberId: integer("addbox_member_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(), // "new_lead", "meeting_update", etc.
  isRead: boolean("is_read").default(false),
  leadId: integer("lead_id").references(() => leads.id),
  connectorId: integer("connector_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Meeting reports table
export const meetingReports = pgTable("meeting_reports", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  connectorId: integer("connector_id").notNull().references(() => users.id),
  attendedMeeting: boolean("attended_meeting"),
  meetingContent: text("meeting_content"), // "問題なし" or "問題あり"
  problemReason: text("problem_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Google OAuth tokens table for calendar integration
export const googleTokens = pgTable("google_tokens", {
  id: serial("id").primaryKey(),
  staffName: text("staff_name").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiry: timestamp("token_expiry").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  connectorCompany: one(connectorCompanies, {
    fields: [users.connectorCompanyId],
    references: [connectorCompanies.id],
  }),
  leads: many(leads),
  meetings: many(meetings),
  contracts: many(contracts),
}));

export const connectorCompaniesRelations = relations(connectorCompanies, ({ one, many }) => ({
  representative: one(users, {
    fields: [connectorCompanies.representativeId],
    references: [users.id],
  }),
  members: many(users),
  contracts: many(contracts),
}));

export const supportersRelations = relations(supporters, ({ many }) => ({
  leads: many(leads),
  meetings: many(meetings),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  connector: one(users, {
    fields: [leads.connectorId],
    references: [users.id],
  }),
  supporter: one(supporters, {
    fields: [leads.supporterId],
    references: [supporters.id],
  }),
  meetings: many(meetings),
  meetingReports: many(meetingReports),
}));

export const meetingsRelations = relations(meetings, ({ one }) => ({
  lead: one(leads, {
    fields: [meetings.leadId],
    references: [leads.id],
  }),
  supporter: one(supporters, {
    fields: [meetings.supporterId],
    references: [supporters.id],
  }),
}));

export const contractsRelations = relations(contracts, ({ one }) => ({
  connectorCompany: one(connectorCompanies, {
    fields: [contracts.connectorCompanyId],
    references: [connectorCompanies.id],
  }),
  addboxMember: one(users, {
    fields: [contracts.addboxMemberId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  lead: one(leads, {
    fields: [notifications.leadId],
    references: [leads.id],
  }),
  connector: one(users, {
    fields: [notifications.connectorId],
    references: [users.id],
  }),
}));

export const meetingReportsRelations = relations(meetingReports, ({ one }) => ({
  lead: one(leads, {
    fields: [meetingReports.leadId],
    references: [leads.id],
  }),
  connector: one(users, {
    fields: [meetingReports.connectorId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConnectorCompanySchema = createInsertSchema(connectorCompanies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSupporterSchema = createInsertSchema(supporters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMeetingSchema = createInsertSchema(meetings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContractSchema = createInsertSchema(contracts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertMeetingReportSchema = createInsertSchema(meetingReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type ConnectorCompany = typeof connectorCompanies.$inferSelect;
export type InsertConnectorCompany = z.infer<typeof insertConnectorCompanySchema>;
export type Supporter = typeof supporters.$inferSelect;
export type InsertSupporter = z.infer<typeof insertSupporterSchema>;
export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Meeting = typeof meetings.$inferSelect;
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Contract = typeof contracts.$inferSelect;
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type MeetingReport = typeof meetingReports.$inferSelect;
export type InsertMeetingReport = z.infer<typeof insertMeetingReportSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
