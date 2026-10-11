import { 
  users, 
  connectorCompanies, 
  supporters, 
  leads, 
  meetings, 
  contracts,
  notifications,
  meetingReports,
  passwordResetTokens,
  type User, 
  type InsertUser,
  type ConnectorCompany,
  type InsertConnectorCompany,
  type Supporter,
  type InsertSupporter,
  type Lead,
  type InsertLead,
  type Meeting,
  type InsertMeeting,
  type Contract,
  type InsertContract,
  type Notification,
  type InsertNotification,
  type MeetingReport,
  type InsertMeetingReport,
  type PasswordResetToken,
  type InsertPasswordResetToken
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, lt, desc, asc, or, isNotNull, sql } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: number): Promise<void>;
  
  // Connector Company methods
  getConnectorCompany(id: number): Promise<ConnectorCompany | undefined>;
  createConnectorCompany(company: InsertConnectorCompany): Promise<ConnectorCompany>;
  getConnectorCompanies(): Promise<ConnectorCompany[]>;
  
  // Supporter methods
  getSupporter(id: number): Promise<Supporter | undefined>;
  getSupporters(): Promise<Supporter[]>;
  getActiveSupporters(): Promise<Supporter[]>;
  createSupporter(supporter: InsertSupporter): Promise<Supporter>;
  updateSupporter(id: number, supporter: Partial<InsertSupporter>): Promise<Supporter>;
  deleteSupporter(id: number): Promise<void>;
  
  // Lead methods
  getLead(id: number): Promise<Lead | undefined>;
  getLeads(filters?: { connectorId?: number; supporterId?: number; status?: string; startDate?: Date; endDate?: Date }): Promise<Lead[]>;
  getLeadsByConnector(connectorId: number): Promise<Lead[]>;
  createLead(lead: InsertLead): Promise<Lead>;
  updateLead(id: number, lead: Partial<InsertLead>): Promise<Lead>;
  deleteLead(id: number): Promise<void>;
  
  // Meeting methods
  getMeeting(id: number): Promise<Meeting | undefined>;
  getMeetings(filters?: { leadId?: number; supporterId?: number; outcome?: string; startDate?: Date; endDate?: Date; connectorId?: number }): Promise<Meeting[]>;
  createMeeting(meeting: InsertMeeting): Promise<Meeting>;
  updateMeeting(id: number, meeting: Partial<InsertMeeting>): Promise<Meeting>;
  deleteMeeting(id: number): Promise<void>;
  
  // Contract methods
  getContract(id: number): Promise<Contract | undefined>;
  getContracts(): Promise<Contract[]>;
  getContractsByConnectorCompany(companyId: number): Promise<Contract[]>;
  createContract(contract: InsertContract): Promise<Contract>;
  updateContract(id: number, contract: Partial<InsertContract>): Promise<Contract>;
  
  // Dashboard methods
  getDashboardStats(filters?: { startDate?: Date; endDate?: Date; connectorId?: number }): Promise<{
    monthlyRevenue: number;
    monthlyMeetings: number;
    totalRevenue: number;
    totalMeetings: number;
    conversionRate: number;
    activeConnectors: number;
  }>;
  
  // Rank management methods
  updateConnectorRank(id: number, rank: number): Promise<void>;
  getConnectorRank(id: number): Promise<number>;
  
  // Notification methods
  getNotifications(): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: number): Promise<void>;
  markAllNotificationsAsRead(): Promise<void>;
  
  // Monthly staff stats method
  getMonthlyStaffStats(year: number, month: number): Promise<{
    [person: string]: {
      inProgress: number;
      completed: number;
      revenue: number;
    };
  }>;
  
  // Meeting report methods
  getMeetingReport(leadId: number): Promise<MeetingReport | undefined>;
  createMeetingReport(report: InsertMeetingReport): Promise<MeetingReport>;
  updateMeetingReport(id: number, report: Partial<InsertMeetingReport>): Promise<MeetingReport>;
  getMeetingReports(): Promise<MeetingReport[]>;
  
  // Password reset token methods
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(id: number): Promise<void>;
  updateUserPassword(userId: number, passwordHash: string): Promise<void>;
}

// In-memory rank storage
const connectorRanks = new Map<number, number>();

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (user) {
      // Add rank to user object
      (user as any).rank = connectorRanks.get(user.id) || 1;
    }
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUsers(): Promise<User[]> {
    const userList = await db.select().from(users).orderBy(desc(users.createdAt));
    return userList.map(user => ({
      ...user,
      rank: connectorRanks.get(user.id) || 1
    })) as User[];
  }

  async updateConnectorRank(id: number, rank: number): Promise<void> {
    connectorRanks.set(id, rank);
  }

  async getConnectorRank(id: number): Promise<number> {
    return connectorRanks.get(id) || 1;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: number, updateUser: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updateUser, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getConnectorCompany(id: number): Promise<ConnectorCompany | undefined> {
    const [company] = await db.select().from(connectorCompanies).where(eq(connectorCompanies.id, id));
    return company || undefined;
  }

  async createConnectorCompany(insertCompany: InsertConnectorCompany): Promise<ConnectorCompany> {
    const [company] = await db
      .insert(connectorCompanies)
      .values(insertCompany)
      .returning();
    return company;
  }

  async getConnectorCompanies(): Promise<ConnectorCompany[]> {
    return await db.select().from(connectorCompanies).orderBy(asc(connectorCompanies.companyName));
  }

  async getSupporter(id: number): Promise<Supporter | undefined> {
    const [supporter] = await db.select().from(supporters).where(eq(supporters.id, id));
    return supporter || undefined;
  }

  async getSupporters(): Promise<Supporter[]> {
    return await db.select().from(supporters).orderBy(asc(supporters.companyName));
  }

  async getActiveSupporters(): Promise<Supporter[]> {
    return await db.select().from(supporters)
      .where(eq(supporters.status, "アクティブ"))
      .orderBy(asc(supporters.companyName));
  }

  async createSupporter(insertSupporter: InsertSupporter): Promise<Supporter> {
    const [supporter] = await db
      .insert(supporters)
      .values(insertSupporter)
      .returning();
    return supporter;
  }

  async updateSupporter(id: number, updateSupporter: Partial<InsertSupporter>): Promise<Supporter> {
    const [supporter] = await db
      .update(supporters)
      .set({ ...updateSupporter, updatedAt: new Date() })
      .where(eq(supporters.id, id))
      .returning();
    return supporter;
  }

  async deleteSupporter(id: number): Promise<void> {
    await db.delete(supporters).where(eq(supporters.id, id));
  }

  async getLead(id: number): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead || undefined;
  }

  async getLeads(filters?: { connectorId?: number; supporterId?: number; status?: string; startDate?: Date; endDate?: Date; useMeetingDate?: boolean }): Promise<any[]> {
    let query = db.select({
      id: leads.id,
      connectorId: leads.connectorId,
      supporterId: leads.supporterId,
      companyName: leads.companyName,
      contactPerson: leads.contactPerson,
      contactInfo: leads.contactInfo,
      meetingFee: leads.meetingFee,
      status: leads.status,
      assignedPerson: leads.assignedPerson,
      assignedPersonSub: leads.assignedPersonSub,
      needs: leads.needs,
      source: leads.source,
      meetingDate: leads.meetingDate,
      dealLinkContact: leads.dealLinkContact,
      dealLinkUrl: leads.dealLinkUrl,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
      supporter: {
        id: supporters.id,
        companyName: supporters.companyName,
        companyUrl: supporters.companyUrl,
        serviceName: supporters.serviceName,
        addboxFee: supporters.addboxFee,
        connectorFee: supporters.connectorFee
      }
    })
    .from(leads)
    .leftJoin(supporters, eq(leads.supporterId, supporters.id));
    
    if (filters) {
      const conditions = [];
      if (filters.connectorId) conditions.push(eq(leads.connectorId, filters.connectorId));
      if (filters.supporterId) conditions.push(eq(leads.supporterId, filters.supporterId));
      if (filters.status) conditions.push(eq(leads.status, filters.status as any));
      
      // Use meetingDate for billing queries, createdAt for regular queries
      if (filters.useMeetingDate && filters.startDate && filters.endDate) {
        // For billing, filter by meetingDate and exclude records without meetingDate
        conditions.push(sql`meeting_date IS NOT NULL`);
        conditions.push(sql`meeting_date >= ${filters.startDate.toISOString().split('T')[0]}`);
        conditions.push(sql`meeting_date <= ${filters.endDate.toISOString().split('T')[0]}`);
      } else {
        // Regular queries use createdAt
        if (filters.startDate) conditions.push(gte(leads.createdAt, filters.startDate));
        if (filters.endDate) conditions.push(lte(leads.createdAt, filters.endDate));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
    }
    
    return await query.orderBy(desc(leads.createdAt));
  }

  async getLeadsByConnector(connectorId: number): Promise<any[]> {
    return await db.select({
      id: leads.id,
      connectorId: leads.connectorId,
      supporterId: leads.supporterId,
      companyName: leads.companyName,
      contactPerson: leads.contactPerson,
      contactInfo: leads.contactInfo,
      meetingFee: leads.meetingFee,
      status: leads.status,
      assignedPerson: leads.assignedPerson,
      assignedPersonSub: leads.assignedPersonSub,
      needs: leads.needs,
      source: leads.source,
      meetingDate: leads.meetingDate,
      dealLinkContact: leads.dealLinkContact,
      dealLinkUrl: leads.dealLinkUrl,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
      supporter: {
        id: supporters.id,
        companyName: supporters.companyName,
        serviceName: supporters.serviceName,
        addboxFee: supporters.addboxFee,
        connectorFee: supporters.connectorFee,
      }
    }).from(leads)
      .leftJoin(supporters, eq(leads.supporterId, supporters.id))
      .where(eq(leads.connectorId, connectorId))
      .orderBy(desc(leads.createdAt));
  }

  async createLead(insertLead: InsertLead): Promise<Lead> {
    const [lead] = await db
      .insert(leads)
      .values([insertLead])
      .returning();
    return lead;
  }

  async updateLead(id: number, updateLead: Partial<InsertLead>): Promise<Lead> {
    try {
      console.log(`Updating lead ${id} with data:`, updateLead);
      const [lead] = await db
        .update(leads)
        .set({ ...updateLead, updatedAt: new Date() })
        .where(eq(leads.id, id))
        .returning();
      console.log(`Successfully updated lead ${id}:`, lead);
      return lead;
    } catch (error) {
      console.error(`Failed to update lead ${id}:`, error);
      throw error;
    }
  }

  async deleteLead(id: number): Promise<void> {
    // まず関連する商談報告書を削除
    await db.delete(meetingReports).where(eq(meetingReports.leadId, id));
    // 次に商談を削除
    await db.delete(leads).where(eq(leads.id, id));
  }

  async getMeeting(id: number): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id));
    return meeting || undefined;
  }

  async getMeetings(filters?: { leadId?: number; supporterId?: number; outcome?: string; startDate?: Date; endDate?: Date; connectorId?: number; leadStatus?: string }): Promise<any[]> {
    let query = db.select({
      id: meetings.id,
      leadId: meetings.leadId,
      supporterId: meetings.supporterId,
      scheduledDate: meetings.scheduledDate,
      locationOrLink: meetings.locationOrLink,
      outcome: meetings.outcome,
      attendanceRequired: meetings.attendanceRequired,
      createdAt: meetings.createdAt,
      updatedAt: meetings.updatedAt,
      addboxFee: meetings.addboxFee,
      connectorFee: meetings.connectorFee,
      lead: {
        id: leads.id,
        companyName: leads.companyName,
        contactPerson: leads.contactPerson,
        connectorId: leads.connectorId,
        supporterId: leads.supporterId
      }
    }).from(meetings).innerJoin(leads, eq(meetings.leadId, leads.id));
    
    if (filters) {
      const conditions = [];
      if (filters.leadId) conditions.push(eq(meetings.leadId, filters.leadId));
      if (filters.supporterId) conditions.push(eq(meetings.supporterId, filters.supporterId));
      if (filters.outcome) conditions.push(eq(meetings.outcome, filters.outcome as any));
      if (filters.startDate && filters.endDate) {
        conditions.push(
          and(
            gte(meetings.scheduledDate, filters.startDate),
            lte(meetings.scheduledDate, filters.endDate)
          )
        );
      }
      if (filters.connectorId) {
        conditions.push(eq(leads.connectorId, filters.connectorId));
      }
      if (filters.leadStatus) {
        conditions.push(eq(leads.status, filters.leadStatus as any));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
    }
    
    return await query.orderBy(desc(meetings.createdAt));
  }

  async createMeeting(insertMeeting: InsertMeeting): Promise<Meeting> {
    const [meeting] = await db
      .insert(meetings)
      .values(insertMeeting)
      .returning();
    return meeting;
  }

  async updateMeeting(id: number, updateMeeting: Partial<InsertMeeting>): Promise<Meeting> {
    const [meeting] = await db
      .update(meetings)
      .set({ ...updateMeeting, updatedAt: new Date() })
      .where(eq(meetings.id, id))
      .returning();
    return meeting;
  }

  async deleteMeeting(id: number): Promise<void> {
    await db.delete(meetings).where(eq(meetings.id, id));
  }

  async getContract(id: number): Promise<Contract | undefined> {
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    return contract || undefined;
  }

  async getContracts(): Promise<Contract[]> {
    return await db.select().from(contracts).orderBy(desc(contracts.createdAt));
  }

  async getContractsByConnectorCompany(companyId: number): Promise<Contract[]> {
    return await db.select().from(contracts)
      .where(eq(contracts.connectorCompanyId, companyId))
      .orderBy(desc(contracts.createdAt));
  }

  async createContract(insertContract: InsertContract): Promise<Contract> {
    const [contract] = await db
      .insert(contracts)
      .values(insertContract)
      .returning();
    return contract;
  }

  async updateContract(id: number, updateContract: Partial<InsertContract>): Promise<Contract> {
    const [contract] = await db
      .update(contracts)
      .set({ ...updateContract, updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning();
    return contract;
  }

  async getDashboardStats(filters?: { startDate?: Date; endDate?: Date; connectorId?: number }): Promise<{
    monthlyRevenue: number;
    monthlyMeetings: number;
    totalRevenue: number;
    totalMeetings: number;
    conversionRate: number;
    activeConnectors: number;
  }> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthIndex = now.getMonth(); // 0-based
    
    // 全てのリードを取得
    const allLeads = await db.select().from(leads);
    
    // 月別商談実績 - 商談実施日（meetingDate）のみで判定
    const monthlyLeads = allLeads.filter((lead: any) => {
      if (lead.status !== "商談実施済み") return false;
      if (filters?.connectorId && lead.connectorId !== filters.connectorId) return false;
      
      // 商談実施日がある場合のみ集計対象
      if (lead.meetingDate) {
        const meetingDate = new Date(lead.meetingDate);
        return meetingDate.getFullYear() === currentYear && meetingDate.getMonth() === currentMonthIndex;
      }
      
      // 商談実施日がない場合は集計対象外
      return false;
    });

    // 月別売上 - 商談実施済みの案件の meetingFee 合計
    const monthlyRevenue = monthlyLeads.reduce((sum, lead) => sum + (lead.meetingFee || 0), 0);

    // 全期間の統計 - 商談実施日のみで判定
    let allCompletedLeads = allLeads.filter((lead: any) => {
      if (lead.status !== "商談実施済み") return false;
      if (filters?.connectorId && lead.connectorId !== filters.connectorId) return false;
      
      // 商談実施日がない場合は集計対象外
      if (!lead.meetingDate) return false;
      
      // 期間フィルタがある場合
      if (filters?.startDate && filters?.endDate) {
        const meetingDate = new Date(lead.meetingDate);
        return meetingDate >= filters.startDate && meetingDate <= filters.endDate;
      }
      
      return true;
    });

    const totalRevenue = allCompletedLeads.reduce((sum, lead) => sum + (lead.meetingFee || 0), 0);

    // 全リード数と成約率計算 - フィルタ適用
    let allLeadsForConversion = allLeads.filter((lead: any) => {
      if (filters?.connectorId && lead.connectorId !== filters.connectorId) return false;
      return true;
    });

    const completedLeads = allLeadsForConversion.filter(lead => lead.status === "商談実施済み");
    const conversionRate = allLeadsForConversion.length > 0 ? (completedLeads.length / allLeadsForConversion.length) * 100 : 0;

    // アクティブコネクター数
    const uniqueConnectorIds = new Set(
      allLeads
        .filter(lead => lead.connectorId !== null)
        .map(lead => lead.connectorId)
    );
    const activeConnectors = uniqueConnectorIds.size;

    return {
      monthlyRevenue,
      monthlyMeetings: monthlyLeads.length,
      totalRevenue,
      totalMeetings: allCompletedLeads.length,
      conversionRate: Math.round(conversionRate * 100) / 100,
      activeConnectors
    };
  }

  async getNotifications(): Promise<Notification[]> {
    return await db.select().from(notifications).orderBy(desc(notifications.createdAt));
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(insertNotification)
      .returning();
    return notification;
  }

  async markNotificationAsRead(id: number): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }

  async markAllNotificationsAsRead(): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.isRead, false));
  }

  async getMonthlyStaffStats(year: number, month: number): Promise<{
    [person: string]: {
      inProgress: number;
      completed: number;
      revenue: number;
    };
  }> {
    const targetYear = year;
    const targetMonth = month - 1; // JavaScript months are 0-based
    
    console.log(`=== Monthly Stats for ${year}年${month}月 ===`);
    
    // 全てのリードを取得
    const allLeads = await db.select().from(leads);
    console.log(`Total leads: ${allLeads.length}`);

    const stats: { [person: string]: { inProgress: number; completed: number; revenue: number; } } = {};
    
    // 担当者別に集計
    ["宮本", "浜野", "芝本", "阿久津"].forEach(person => {
      // 進行中の案件（どの月でも継続してカウント）
      const ongoingLeads = allLeads.filter((lead: any) => {
        return lead.assignedPerson === person && lead.status === "進行中";
      });
      
      // 日程確定の案件（該当月のみカウント）
      const scheduledLeads = allLeads.filter((lead: any) => {
        if (lead.assignedPerson !== person || lead.status !== "日程確定") return false;
        if (!lead.meetingDate) return false;
        
        const meetingDate = new Date(lead.meetingDate);
        return meetingDate.getFullYear() === targetYear && meetingDate.getMonth() === targetMonth;
      });
      
      const inProgressLeads = [...ongoingLeads, ...scheduledLeads];
      
      // 商談実施済みのリード - 商談実施日が指定月内のもの
      const completedLeads = allLeads.filter((lead: any) => {
        if (lead.status !== "商談実施済み" || lead.assignedPerson !== person) return false;
        if (!lead.meetingDate) return false;
        const meetingDate = new Date(lead.meetingDate);
        return meetingDate.getFullYear() === targetYear && meetingDate.getMonth() === targetMonth;
      });
      
      const inProgress = inProgressLeads.length;
      const completed = completedLeads.length;
      const revenue = completedLeads.reduce((sum, lead) => sum + (lead.meetingFee || 0), 0);
      
      console.log(`${person}: inProgress=${inProgress}, completed=${completed}, revenue=${revenue}`);
      
      stats[person] = { inProgress, completed, revenue };
    });

    return stats;
  }

  async getMeetingReport(leadId: number): Promise<MeetingReport | undefined> {
    const [report] = await db
      .select()
      .from(meetingReports)
      .where(eq(meetingReports.leadId, leadId));
    return report || undefined;
  }

  async createMeetingReport(insertReport: InsertMeetingReport): Promise<MeetingReport> {
    const [report] = await db
      .insert(meetingReports)
      .values(insertReport)
      .returning();
    return report;
  }

  async updateMeetingReport(id: number, updateReport: Partial<InsertMeetingReport>): Promise<MeetingReport> {
    const [report] = await db
      .update(meetingReports)
      .set({ ...updateReport, updatedAt: new Date() })
      .where(eq(meetingReports.id, id))
      .returning();
    return report;
  }

  async getMeetingReports(): Promise<any[]> {
    return await db
      .select({
        id: meetingReports.id,
        leadId: meetingReports.leadId,
        connectorId: meetingReports.connectorId,
        attendedMeeting: meetingReports.attendedMeeting,
        meetingContent: meetingReports.meetingContent,
        problemReason: meetingReports.problemReason,
        notes: meetingReports.notes,
        createdAt: meetingReports.createdAt,
        updatedAt: meetingReports.updatedAt,
        lead: {
          id: leads.id,
          companyName: leads.companyName,
          contactPerson: leads.contactPerson,
          status: leads.status,
        },
        connector: {
          id: users.id,
          name: users.name,
          email: users.email,
        }
      })
      .from(meetingReports)
      .leftJoin(leads, eq(meetingReports.leadId, leads.id))
      .leftJoin(users, eq(meetingReports.connectorId, users.id))
      .orderBy(desc(meetingReports.createdAt));
  }

  async createPasswordResetToken(insertToken: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [token] = await db
      .insert(passwordResetTokens)
      .values(insertToken)
      .returning();
    return token;
  }

  async getPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | undefined> {
    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    return token || undefined;
  }

  async markPasswordResetTokenUsed(id: number): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, id));
  }

  async updateUserPassword(userId: number, passwordHash: string): Promise<void> {
    await db
      .update(users)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}

export const storage = new DatabaseStorage();
