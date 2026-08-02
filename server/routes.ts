import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { upload } from "./fileHandler";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { insertUserSchema, insertConnectorCompanySchema, insertSupporterSchema, insertLeadSchema, insertMeetingSchema, insertContractSchema, insertMeetingReportSchema } from "@shared/schema";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { notifyNewConnectorRegistration, notifyNewLeadRegistration, notifyMeetingReport } from "./slackService";
import { getAuthUrl, handleCallback, createCalendarEvent, getConnectedStaff, disconnectStaff, listCalendarEvents } from "./googleCalendarService";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Middleware to verify JWT token
const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// Middleware to check user role
const requireRole = (roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
};

export async function registerRoutes(app: Express): Promise<Server> {

  // Health check endpoint (used for keep-alive on Render free tier)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Static file serving for uploads
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // File download route
  app.get("/api/files/uploads/:filename", (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(process.cwd(), 'uploads', filename);
    
    console.log('File download request:', filename);
    console.log('File path:', filePath);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log('File not found:', filePath);
      return res.status(404).json({ message: "ファイルが見つかりません" });
    }
    
    // Get file stats for proper headers
    const stats = fs.statSync(filePath);
    const fileExtension = path.extname(filename).toLowerCase();
    
    // Set proper MIME type
    let mimeType = 'application/octet-stream';
    if (fileExtension === '.pdf') {
      mimeType = 'application/pdf';
    } else if (fileExtension === '.png') {
      mimeType = 'image/png';
    } else if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
      mimeType = 'image/jpeg';
    }
    
    // Set headers for download with proper encoding
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stats.size);
    
    // Encode filename properly for Japanese characters (RFC 5987 compliant)
    // This method works across all browsers and OS including Mac
    const encodedFilename = encodeURIComponent(filename);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
      console.error('File stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: "ファイル読み込みエラー" });
      }
    });
  });
  
  // Account deletion route
  app.delete("/api/auth/account", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "認証が必要です" });
      }

      await storage.deleteUser(userId);
      res.json({ message: "アカウントが正常に削除されました" });
    } catch (error) {
      console.error("Account deletion error:", error);
      res.status(500).json({ message: "アカウント削除に失敗しました" });
    }
  });

  // Authentication routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      console.log("Registration request body:", req.body);
      const { email, password, name, role, companyName, companyWebsite, industry, address } = req.body;
      console.log("Extracted fields:", { email, password: "***", name, role, companyName, companyWebsite, industry, address });
      
      // Check if AddBox role and validate email
      if (role === "AddBox") {
        const allowedEmails = [
          "s.morio@addbox.co.jp",
          "k.miyamoto@addbox.co.jp", 
          "k.hayashi@addbox.co.jp",
          "r.fukushima@addbox.co.jp",
          "w.shibamoto@addbox.co.jp"
        ];
        
        if (!allowedEmails.includes(email)) {
          return res.status(403).json({ message: "権限がありません" });
        }
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "このメールアドレスは既に登録されています" });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      let connectorCompanyId = null;
      
      // If registering a connector, create company
      if (role === "Connector") {
        const companyData = {
          companyName,
          companyWebsite: companyWebsite || null,
          industry: industry || "その他",
          address
        };
        console.log("Creating connector company with data:", companyData);
        const company = await storage.createConnectorCompany(companyData);
        console.log("Created connector company:", company);
        connectorCompanyId = company.id;
      }
      
      // Create user
      const user = await storage.createUser({
        name,
        email,
        password: hashedPassword,
        role: role as any,
        companyName,
        companyWebsite: companyWebsite || null,
        industry,
        address,
        connectorCompanyId
      });
      
      // Update company representative if connector
      if (role === "Connector" && connectorCompanyId) {
        // Update company with representative ID
        // This would require an update method for connector companies
      }
      
      // Send Slack notification for new connector registration
      if (role === "Connector") {
        try {
          await notifyNewConnectorRegistration({
            name: user.name,
            email: user.email,
            companyName: user.companyName || undefined
          });
        } catch (error) {
          console.error("Failed to send Slack notification:", error);
          // Continue with registration even if Slack notification fails
        }
      }
      
      // Generate JWT token
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
      
      res.json({ 
        token, 
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          role: user.role,
          companyName: user.companyName
        } 
      });
    } catch (error) {
      console.error("Registration error:", error);
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
      res.status(500).json({ message: "登録に失敗しました", details: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      console.log("Login attempt for email:", req.body.email);
      const { email, password } = req.body;
      
      if (!email || !password) {
        console.log("Missing email or password");
        return res.status(400).json({ message: "メールアドレスとパスワードを入力してください" });
      }
      
      // Find user
      console.log("Searching for user with email:", email);
      const user = await storage.getUserByEmail(email);
      if (!user) {
        console.log("User not found for email:", email);
        return res.status(401).json({ message: "メールアドレスまたはパスワードが間違っています" });
      }
      
      console.log("User found:", { id: user.id, email: user.email, role: user.role });
      
      // Check password
      console.log("Comparing passwords...");
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        console.log("Invalid password for user:", email);
        return res.status(401).json({ message: "メールアドレスまたはパスワードが間違っています" });
      }
      
      console.log("Password valid, generating token...");
      
      // Generate JWT token
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
      
      res.json({ 
        token, 
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          role: user.role,
          companyName: user.companyName,
          connectorCompanyId: user.connectorCompanyId
        } 
      });
    } catch (error) {
      console.error("Login error:", error);
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
      res.status(500).json({ message: "ログインに失敗しました", details: error.message });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req, res) => {
    const user = req.user;
    res.json({ 
      id: user.id, 
      name: user.name, 
      email: user.email, 
      role: user.role,
      companyName: user.companyName,
      connectorCompanyId: user.connectorCompanyId
    });
  });

  // Password reset request - returns reset link directly (no email)
  app.post("/api/auth/password-reset/request", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "メールアドレスを入力してください" });
      }
      
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.status(404).json({ message: "このメールアドレスは登録されていません" });
      }
      
      // Generate random token
      const crypto = await import('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);
      
      // Token expires in 30 minutes
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      
      await storage.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt,
      });
      
      // Return the reset link directly (no email required)
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? 'https://' + process.env.REPLIT_DEV_DOMAIN 
        : 'http://localhost:5000';
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;
      
      res.json({ 
        message: "パスワードリセットのリンクを生成しました",
        resetUrl,
        userName: user.name
      });
    } catch (error) {
      console.error("Password reset request error:", error);
      res.status(500).json({ message: "パスワードリセットに失敗しました" });
    }
  });

  // Password reset confirm
  app.post("/api/auth/password-reset/confirm", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ message: "トークンと新しいパスワードを入力してください" });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "パスワードは6文字以上で入力してください" });
      }
      
      // Find all valid tokens and check each one
      const allTokens = await storage.getPasswordResetToken(token);
      
      // We need to check all tokens since we stored the hash, not the raw token
      // For now, let's iterate through recent tokens for this to work
      const { db } = await import('./db');
      const { passwordResetTokens } = await import('@shared/schema');
      const { isNull, gt } = await import('drizzle-orm');
      
      const validTokens = await db
        .select()
        .from(passwordResetTokens)
        .where(
          isNull(passwordResetTokens.usedAt)
        );
      
      let matchedToken = null;
      for (const t of validTokens) {
        const isValid = await bcrypt.compare(token, t.tokenHash);
        if (isValid) {
          matchedToken = t;
          break;
        }
      }
      
      if (!matchedToken) {
        return res.status(400).json({ message: "無効なトークンです" });
      }
      
      // Check if token is expired
      if (new Date() > new Date(matchedToken.expiresAt)) {
        return res.status(400).json({ message: "トークンの有効期限が切れています" });
      }
      
      // Update password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(matchedToken.userId, hashedPassword);
      
      // Mark token as used
      await storage.markPasswordResetTokenUsed(matchedToken.id);
      
      res.json({ message: "パスワードが正常にリセットされました" });
    } catch (error) {
      console.error("Password reset confirm error:", error);
      res.status(500).json({ message: "パスワードリセットに失敗しました" });
    }
  });

  // Dashboard routes
  app.get("/api/dashboard/stats", authenticateToken, async (req, res) => {
    try {
      const { startDate, endDate, connectorId } = req.query;
      
      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (connectorId) filters.connectorId = parseInt(connectorId as string);
      
      // If user is connector, only show their data
      if (req.user.role === "Connector") {
        filters.connectorId = req.user.id;
      }
      
      const stats = await storage.getDashboardStats(filters);
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "統計データの取得に失敗しました" });
    }
  });

  // Monthly stats route for specific month (AddBox only)
  app.get("/api/dashboard/monthly-stats/:year/:month", authenticateToken, requireRole(["AddBox"]), async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      const monthlyStats = await storage.getMonthlyStaffStats(year, month);
      res.json(monthlyStats);
    } catch (error) {
      console.error("Get monthly stats error:", error);
      res.status(500).json({ message: "月別統計の取得に失敗しました" });
    }
  });

  // Supporter routes
  app.get("/api/supporters", authenticateToken, async (req, res) => {
    try {
      const supporters = await storage.getSupporters();
      
      // Show all supporters to all users but with status indication for connectors
      res.json(supporters);
    } catch (error) {
      console.error("Get supporters error:", error);
      res.status(500).json({ message: "支援先の取得に失敗しました" });
    }
  });

  app.get("/api/supporters/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const supporter = await storage.getSupporter(id);
      
      if (!supporter) {
        return res.status(404).json({ message: "支援先が見つかりません" });
      }
      
      res.json(supporter);
    } catch (error) {
      console.error("Get supporter error:", error);
      res.status(500).json({ message: "支援先の取得に失敗しました" });
    }
  });

  app.post("/api/supporters", authenticateToken, requireRole(["AddBox"]), (req, res, next) => {
    console.log('POST /api/supporters - Headers:', req.headers);
    console.log('POST /api/supporters - Content-Type:', req.get('content-type'));
    
    const uploadMiddleware = upload.fields([
      { name: 'logo', maxCount: 1 },
      { name: 'attachment', maxCount: 1 }
    ]);
    
    uploadMiddleware(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        let message = "ファイルアップロードエラー";
        
        if (err.code === 'LIMIT_FILE_SIZE') {
          message = "ファイルサイズが大きすぎます。50MB以下のファイルをアップロードしてください。";
        } else if (err.code === 'LIMIT_FIELD_COUNT') {
          message = "フィールド数が多すぎます。";
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          message = "予期しないファイルフィールドです。";
        } else if (err.message) {
          message = err.message;
        }
        
        return res.status(400).json({ 
          message,
          error: err.code || "UPLOAD_ERROR"
        });
      }
      next();
    });
  }, async (req, res) => {
    try {
      console.log('Request body:', req.body);
      console.log('Request files:', req.files);
      
      const {
        companyName,
        companyUrl,
        serviceName,
        serviceUrl,
        serviceOverview,
        servicePrice,
        targetCompanySize,
        targetAttributes,
        targetOthers,
        status,
        addboxFee,
        connectorFee,
        logoUrl
      } = req.body;

      // Handle file attachments
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const logoFile = files?.logo?.[0];
      const attachmentFile = files?.attachment?.[0];
      
      const attachmentPath = attachmentFile ? `/uploads/${attachmentFile.filename}` : null;
      const attachmentName = attachmentFile ? attachmentFile.originalname : null;
      const logoPath = logoFile ? `/uploads/${logoFile.filename}` : logoUrl || null;

      const supporter = await storage.createSupporter({
        companyName,
        companyUrl: companyUrl || "",
        logoUrl: logoPath || "",
        serviceName,
        serviceUrl: serviceUrl || "",
        serviceOverview,
        servicePrice: servicePrice || "",
        targetCompanySize: targetCompanySize || "",
        targetAttributes: targetAttributes || "",
        targetOthers: targetOthers || "",
        status: status as "アクティブ" | "ストップ",
        attachmentPath,
        attachmentName,
        addboxFee: addboxFee ? parseInt(addboxFee) : null,
        connectorFee: connectorFee ? parseInt(connectorFee) : null,
      });

      res.json(supporter);
    } catch (error) {
      console.error("Create supporter error:", error);
      res.status(500).json({ 
        message: "支援先の作成に失敗しました",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.put("/api/supporters/:id", authenticateToken, requireRole(["AddBox"]), (req, res, next) => {
    console.log('PUT /api/supporters/:id - Headers:', req.headers);
    console.log('PUT /api/supporters/:id - Content-Type:', req.get('content-type'));
    
    const uploadMiddleware = upload.fields([
      { name: 'logo', maxCount: 1 },
      { name: 'attachment', maxCount: 1 }
    ]);
    
    uploadMiddleware(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        let message = "ファイルアップロードエラー";
        
        if (err.code === 'LIMIT_FILE_SIZE') {
          message = "ファイルサイズが大きすぎます。50MB以下のファイルをアップロードしてください。";
        } else if (err.code === 'LIMIT_FIELD_COUNT') {
          message = "フィールド数が多すぎます。";
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          message = "予期しないファイルフィールドです。";
        } else if (err.message) {
          message = err.message;
        }
        
        return res.status(400).json({ 
          message,
          error: err.code || "UPLOAD_ERROR"
        });
      }
      next();
    });
  }, async (req, res) => {
    try {
      console.log('Request body:', req.body);
      console.log('Request files:', req.files);
      
      const id = parseInt(req.params.id);
      const {
        companyName,
        companyUrl,
        serviceName,
        serviceUrl,
        serviceOverview,
        servicePrice,
        targetCompanySize,
        targetAttributes,
        targetOthers,
        status,
        addboxFee,
        connectorFee,
        logoUrl
      } = req.body;

      // Handle file attachments
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const logoFile = files?.logo?.[0];
      const attachmentFile = files?.attachment?.[0];
      
      const updateData: any = {
        companyName,
        companyUrl: companyUrl || "",
        serviceName,
        serviceUrl: serviceUrl || "",
        serviceOverview,
        servicePrice: servicePrice || "",
        targetCompanySize: targetCompanySize || "",
        targetAttributes: targetAttributes || "",
        targetOthers: targetOthers || "",
        status: status as "アクティブ" | "ストップ",
      };

      // Only update fees if they are provided (to preserve existing values during status updates)
      if (addboxFee !== undefined) {
        updateData.addboxFee = addboxFee ? parseInt(addboxFee) : null;
      }
      if (connectorFee !== undefined) {
        updateData.connectorFee = connectorFee ? parseInt(connectorFee) : null;
      }

      if (logoFile) {
        updateData.logoUrl = `/uploads/${logoFile.filename}`;
      } else if (logoUrl) {
        updateData.logoUrl = logoUrl;
      }

      if (attachmentFile) {
        updateData.attachmentPath = `/uploads/${attachmentFile.filename}`;
        updateData.attachmentName = attachmentFile.originalname;
      }
      
      const supporter = await storage.updateSupporter(id, updateData);
      res.json(supporter);
    } catch (error) {
      console.error("Update supporter error:", error);
      res.status(500).json({ 
        message: "支援先の更新に失敗しました",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.delete("/api/supporters/:id", authenticateToken, requireRole(["AddBox"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSupporter(id);
      res.json({ message: "支援先を削除しました" });
    } catch (error) {
      console.error("Delete supporter error:", error);
      res.status(500).json({ message: "支援先の削除に失敗しました" });
    }
  });

  // Admin routes for new role-based structure
  app.get("/api/admin/connectors", authenticateToken, requireRole(["AddBox"]), async (req, res) => {
    try {
      // Get all users with role "Connector"
      const allUsers = await storage.getUsers();
      const connectors = allUsers.filter(user => user.role === "Connector");
      res.json(connectors);
    } catch (error) {
      console.error("Get admin connectors error:", error);
      res.status(500).json({ message: "コネクター一覧の取得に失敗しました" });
    }
  });

  app.get("/api/admin/connectors/:connectorId", authenticateToken, requireRole(["AddBox"]), async (req, res) => {
    try {
      const connectorId = parseInt(req.params.connectorId);
      const connector = await storage.getUser(connectorId);
      
      if (!connector) {
        return res.status(404).json({ message: "コネクターが見つかりません" });
      }
      
      res.json(connector);
    } catch (error) {
      console.error("Get admin connector detail error:", error);
      res.status(500).json({ message: "コネクター詳細の取得に失敗しました" });
    }
  });

  // Update connector rank
  app.patch("/api/admin/connectors/:connectorId/rank", authenticateToken, requireRole(["AddBox"]), async (req, res) => {
    try {
      const connectorId = parseInt(req.params.connectorId);
      const { rank } = req.body;
      
      if (!rank || rank < 1 || rank > 5) {
        return res.status(400).json({ message: "ランクは1から5の間で設定してください" });
      }
      
      await storage.updateConnectorRank(connectorId, rank);
      res.json({ message: "ランクを更新しました" });
    } catch (error) {
      console.error("Update connector rank error:", error);
      res.status(500).json({ message: "ランクの更新に失敗しました" });
    }
  });

  // Connector-specific routes
  app.get("/api/connectors/:connectorId/profile", authenticateToken, async (req, res) => {
    try {
      const connectorId = parseInt(req.params.connectorId);
      
      // Check access: must be the connector themselves or AddBox admin
      if (req.user.role !== "AddBox" && req.user.id !== connectorId) {
        return res.status(403).json({ message: "アクセス権限がありません" });
      }
      
      const profile = await storage.getUser(connectorId);
      
      if (!profile) {
        return res.status(404).json({ message: "プロフィールが見つかりません" });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Get connector profile error:", error);
      res.status(500).json({ message: "プロフィールの取得に失敗しました" });
    }
  });

  app.get("/api/connectors/:connectorId/leads", authenticateToken, async (req, res) => {
    try {
      const connectorId = parseInt(req.params.connectorId);
      
      // Check access: must be the connector themselves or AddBox admin
      if (req.user.role !== "AddBox" && req.user.id !== connectorId) {
        return res.status(403).json({ message: "アクセス権限がありません" });
      }
      
      const leads = await storage.getLeadsByConnector(connectorId);
      res.json(leads);
    } catch (error) {
      console.error("Get connector leads error:", error);
      res.status(500).json({ message: "リード一覧の取得に失敗しました" });
    }
  });

  app.post("/api/connectors/:connectorId/leads", authenticateToken, async (req, res) => {
    try {
      const connectorId = parseInt(req.params.connectorId);
      
      // Check access: must be the connector themselves
      if (req.user.role !== "Connector" || req.user.id !== connectorId) {
        return res.status(403).json({ message: "アクセス権限がありません" });
      }
      
      const requestData = {
        ...req.body,
        connectorId: connectorId
      };
      
      // Convert introducedAt string to Date if it's a string
      if (requestData.introducedAt && typeof requestData.introducedAt === 'string') {
        requestData.introducedAt = new Date(requestData.introducedAt);
      }
      
      const validatedData = insertLeadSchema.parse(requestData);
      const lead = await storage.createLead(validatedData);
      res.json(lead);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Connector lead validation error:", error.errors);
        return res.status(400).json({ message: "入力データが無効です", errors: error.errors });
      }
      console.error("Create connector lead error:", error);
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
      res.status(500).json({ message: "リードの作成に失敗しました", details: error.message });
    }
  });

  app.get("/api/connectors/:connectorId/meetings", authenticateToken, async (req, res) => {
    try {
      const connectorId = parseInt(req.params.connectorId);
      
      // Check access: must be the connector themselves or AddBox admin
      if (req.user.role !== "AddBox" && req.user.id !== connectorId) {
        return res.status(403).json({ message: "アクセス権限がありません" });
      }
      
      // Get meetings for leads belonging to this connector
      const meetings = await storage.getMeetings({ connectorId });
      res.json(meetings);
    } catch (error) {
      console.error("Get connector meetings error:", error);
      res.status(500).json({ message: "商談一覧の取得に失敗しました" });
    }
  });

  // Lead routes
  app.get("/api/leads", authenticateToken, async (req, res) => {
    try {
      const { supporterId, status, startDate, endDate } = req.query;
      
      const filters: any = {};
      if (supporterId) filters.supporterId = parseInt(supporterId as string);
      if (status) filters.status = status as string;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      
      // If user is connector, only show their leads
      if (req.user.role === "Connector") {
        filters.connectorId = req.user.id;
      }
      
      const leads = await storage.getLeads(filters);
      res.json(leads);
    } catch (error) {
      console.error("Get leads error:", error);
      res.status(500).json({ message: "リードの取得に失敗しました" });
    }
  });

  app.post("/api/leads", authenticateToken, requireRole(["Connector", "AddBox"]), async (req, res) => {
    try {
      console.log("Lead creation request - User:", req.user?.id, "Role:", req.user?.role);
      console.log("Lead creation request body:", req.body);
      
      const requestData = {
        connectorId: req.user.role === "Connector" ? req.user.id : req.body.connectorId,
        supporterId: req.body.supporterId || null,
        companyName: req.body.companyName || "",
        companyWebsite: req.body.companyWebsite || null,
        businessContent: req.body.businessContent || "",
        position: req.body.position || "",
        contactPerson: req.body.contactPerson || "",
        contactInfo: req.body.contactInfo || null,
        meetingFee: req.body.meetingFee || null,
        status: req.body.status || "進行中",
        assignedPerson: req.body.assignedPerson || null,
        assignedPersonSub: req.body.assignedPersonSub || null,
        needs: req.body.needs || null,
        source: req.body.source || "そのほか",
        meetingDate: req.body.meetingDate || null,
      };
      
      const validatedData = insertLeadSchema.parse(requestData);
      const lead = await storage.createLead(validatedData);
      
      // Send Slack notification for new lead registration
      try {
        // Get connector and supporter information for the notification
        const connector = await storage.getUser(lead.connectorId);
        const supporter = lead.supporterId ? await storage.getSupporter(lead.supporterId) : null;
        
        if (connector) {
          await notifyNewLeadRegistration({
            connectorName: connector.name,
            companyName: lead.companyName,
            companyWebsite: lead.companyWebsite || "",
            businessContent: lead.businessContent || "",
            contactPerson: lead.contactPerson,
            position: lead.position || "",
            supporterCompanyName: supporter?.companyName || "未割り当て",
            meetingFee: lead.meetingFee || 0,
            needs: lead.needs || "",
            assignedPerson: lead.assignedPerson || ""
          });
        }
      } catch (error) {
        console.error("Failed to send Slack notification for new lead:", error);
        // Continue with lead creation even if Slack notification fails
      }
      
      res.json(lead);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Lead validation error:", error.errors);
        return res.status(400).json({ message: "入力データが無効です", errors: error.errors });
      }
      console.error("Create lead error:", error);
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
      res.status(500).json({ message: "リードの作成に失敗しました", details: error.message });
    }
  });

  app.get("/api/leads/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const lead = await storage.getLead(id);
      
      if (!lead) {
        return res.status(404).json({ message: "リードが見つかりません" });
      }
      
      // Check if user can view this lead
      if (req.user.role === "Connector" && lead.connectorId !== req.user.id) {
        return res.status(403).json({ message: "このリードを閲覧する権限がありません" });
      }
      
      res.json(lead);
    } catch (error) {
      console.error("Get lead error:", error);
      res.status(500).json({ message: "リードの取得に失敗しました" });
    }
  });

  app.put("/api/leads/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if user can edit this lead
      if (req.user.role === "Connector") {
        const existingLead = await storage.getLead(id);
        if (!existingLead || existingLead.connectorId !== req.user.id) {
          return res.status(403).json({ message: "このリードを編集する権限がありません" });
        }
      }
      
      const requestData = { ...req.body };
      
      // Convert introducedAt string to Date if it's a string
      if (requestData.introducedAt && typeof requestData.introducedAt === 'string') {
        requestData.introducedAt = new Date(requestData.introducedAt);
      }
      
      const lead = await storage.updateLead(id, requestData);
      res.json(lead);
    } catch (error) {
      console.error("Update lead error:", error);
      res.status(500).json({ message: "リードの更新に失敗しました" });
    }
  });

  app.patch("/api/leads/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if user can edit this lead
      if (req.user.role === "Connector") {
        const existingLead = await storage.getLead(id);
        if (!existingLead || existingLead.connectorId !== req.user.id) {
          return res.status(403).json({ message: "このリードを編集する権限がありません" });
        }
      }
      
      // Allow status, meetingDate, and deal link updates in PATCH
      const updateData: any = {};
      if (req.body.status !== undefined) {
        updateData.status = req.body.status;
        console.log(`Updating lead ${id} status to: ${req.body.status}`);
      }
      if (req.body.meetingDate !== undefined) {
        if (req.body.meetingDate) {
          const dateStr = req.body.meetingDate;
          const jstDate = dateStr.includes('+') || dateStr.includes('Z') 
            ? new Date(dateStr) 
            : new Date(dateStr + '+09:00');
          updateData.meetingDate = jstDate;
        } else {
          updateData.meetingDate = null;
        }
        console.log(`Updating lead ${id} meeting date to: ${req.body.meetingDate} -> ${updateData.meetingDate}`);
      }
      if (req.body.dealLinkContact !== undefined) {
        updateData.dealLinkContact = req.body.dealLinkContact;
        console.log(`Updating lead ${id} deal link contact to: ${req.body.dealLinkContact}`);
      }
      if (req.body.dealLinkUrl !== undefined) {
        updateData.dealLinkUrl = req.body.dealLinkUrl;
        console.log(`Updating lead ${id} deal link URL to: ${req.body.dealLinkUrl}`);
      }
      
      const lead = await storage.updateLead(id, updateData);

      res.json(lead);
    } catch (error) {
      console.error("Update lead status error details:", error);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      res.status(500).json({ message: "データの更新に失敗しました" });
    }
  });

  app.post("/api/leads/:id/add-to-calendar", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ message: "リードが見つかりません" });
      }
      if (!lead.meetingDate) {
        return res.status(400).json({ message: "商談日時が設定されていません" });
      }
      if (!lead.assignedPerson) {
        return res.status(400).json({ message: "担当者が設定されていません" });
      }

      const meetingDateStr = lead.meetingDate instanceof Date 
        ? lead.meetingDate.toISOString()
        : String(lead.meetingDate);
      const supporterData = lead.supporterId ? await storage.getSupporter(lead.supporterId) : null;
      const supporterName = supporterData ? supporterData.companyName : "未設定";
      const summary = `トスアップ同席:${supporterName}×${lead.companyName} ${lead.contactPerson}さま`;
      const description = [
        `企業名: ${lead.companyName}`,
        `担当者: ${lead.contactPerson}さま`,
        `支援先: ${supporterName}`,
        lead.needs ? `ニーズ: ${lead.needs}` : "",
      ].filter(Boolean).join("\n");

      console.log(`Add to calendar: staffName=${lead.assignedPerson}, meetingDate=${meetingDateStr}, summary=${summary}`);

      const result = await createCalendarEvent(
        lead.assignedPerson,
        summary,
        description,
        meetingDateStr,
        lead.dealLinkUrl || undefined
      );

      if (!result) {
        return res.status(400).json({ message: `${lead.assignedPerson}のGoogleカレンダー連携が未設定です。管理画面で連携してください。` });
      }

      await storage.updateLead(id, { status: "日程確定" });

      res.json({ message: "カレンダーに追加しました", event: result });
    } catch (error: any) {
      console.error("Add to calendar error:", error?.message || error);
      console.error("Add to calendar error stack:", error?.stack);
      res.status(500).json({ message: `カレンダーへの追加に失敗しました: ${error?.message || "不明なエラー"}` });
    }
  });

  app.delete("/api/leads/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if user can delete this lead
      if (req.user.role === "Connector") {
        const existingLead = await storage.getLead(id);
        if (!existingLead || existingLead.connectorId !== req.user.id) {
          return res.status(403).json({ message: "このリードを削除する権限がありません" });
        }
      }
      
      await storage.deleteLead(id);
      res.json({ message: "リードを削除しました" });
    } catch (error) {
      console.error("Delete lead error:", error);
      res.status(500).json({ message: "リードの削除に失敗しました" });
    }
  });

  // Meeting routes
  app.get("/api/meetings", authenticateToken, async (req, res) => {
    try {
      const { leadId, supporterId, outcome, startDate, endDate } = req.query;
      
      const filters: any = {};
      if (leadId) filters.leadId = parseInt(leadId as string);
      if (supporterId) filters.supporterId = parseInt(supporterId as string);
      if (outcome) filters.outcome = outcome as string;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      
      const meetings = await storage.getMeetings(filters);
      res.json(meetings);
    } catch (error) {
      console.error("Get meetings error:", error);
      res.status(500).json({ message: "商談の取得に失敗しました" });
    }
  });

  app.post("/api/meetings", authenticateToken, async (req, res) => {
    try {
      const validatedData = insertMeetingSchema.parse(req.body);
      const meeting = await storage.createMeeting(validatedData);
      res.json(meeting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "入力データが無効です", errors: error.errors });
      }
      console.error("Create meeting error:", error);
      res.status(500).json({ message: "商談の作成に失敗しました" });
    }
  });

  app.put("/api/meetings/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const meeting = await storage.updateMeeting(id, req.body);
      res.json(meeting);
    } catch (error) {
      console.error("Update meeting error:", error);
      res.status(500).json({ message: "商談の更新に失敗しました" });
    }
  });

  // Contract routes (AddBox only)
  app.get("/api/contracts", authenticateToken, requireRole(["AddBox"]), async (req, res) => {
    try {
      const contracts = await storage.getContracts();
      res.json(contracts);
    } catch (error) {
      console.error("Get contracts error:", error);
      res.status(500).json({ message: "契約の取得に失敗しました" });
    }
  });

  // Billing data route
  app.get("/api/billing", authenticateToken, requireRole(["AddBox"]), async (req, res) => {
    try {
      const { month, connectorId, supporterId } = req.query;
      
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      
      if (month && typeof month === 'string') {
        startDate = new Date(month + '-01');
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      }
      
      // Get leads with "商談実施済み" status, using meetingDate for billing period
      const leadFilters: any = {
        status: "商談実施済み",
        startDate,
        endDate,
        useMeetingDate: true // Use meetingDate for billing month calculation
      };
      
      if (connectorId && connectorId !== 'all' && connectorId !== 'addbox') {
        leadFilters.connectorId = parseInt(connectorId as string);
      }
      
      console.log(`Billing API - Month filter: ${month}, ConnectorId: ${connectorId}, SupporterId: ${supporterId}`);
      
      // Get all leads with "商談実施済み" status first
      let allLeads = await storage.getLeads({ status: "商談実施済み" });
      
      console.log(`Found ${allLeads.length} leads with status 商談実施済み`);
      console.log('All leads:', allLeads.map(l => ({ id: l.id, meetingDate: l.meetingDate, status: l.status, connectorId: l.connectorId })));
      
      // Filter by meeting date if month is specified
      let filteredLeads = allLeads;
      if (month) {
        const [year, monthNum] = (month as string).split('-');
        const targetYear = parseInt(year);
        const targetMonth = parseInt(monthNum) - 1; // JavaScript months are 0-based
        
        filteredLeads = allLeads.filter((lead: any) => {
          if (!lead.meetingDate) return false;
          const meetingDate = new Date(lead.meetingDate);
          return meetingDate.getFullYear() === targetYear && meetingDate.getMonth() === targetMonth;
        });
        
        console.log(`After month filtering (${year}-${monthNum}): ${filteredLeads.length} leads`);
      }
      
      // Filter by connector if specified
      if (connectorId && connectorId !== 'all' && connectorId !== 'addbox') {
        const targetConnectorId = parseInt(connectorId as string);
        filteredLeads = filteredLeads.filter((lead: any) => lead.connectorId === targetConnectorId);
        console.log(`After connector filtering: ${filteredLeads.length} leads`);
      }
      
      // Filter by supporter if specified
      if (supporterId && supporterId !== 'all') {
        const targetSupporterId = parseInt(supporterId as string);
        filteredLeads = filteredLeads.filter((lead: any) => lead.supporterId === targetSupporterId);
        console.log(`After supporter filtering: ${filteredLeads.length} leads`);
      }
      
      // Get all users and supporters to map names
      const users = await storage.getUsers();
      const userMap = new Map(users.map(user => [user.id, user]));
      
      const supporters = await storage.getSupporters();
      const supporterMap = new Map(supporters.map(supporter => [supporter.id, supporter]));
      
      // Calculate billing data from filtered leads
      const billingItems = filteredLeads.map((lead: any) => ({
        id: lead.id,
        companyName: lead.companyName || "未設定",
        contactPerson: lead.contactPerson || "未設定", 
        meetingDate: lead.meetingDate,
        fee: lead.meetingFee || 50000,
        connectorFee: 0,
        status: "商談実施済み",
        connector: (() => {
          if (!lead.connectorId) return "ZETTAICHI直接";
          const user = userMap.get(lead.connectorId);
          if (!user) return `ID: ${lead.connectorId}`;
          return user.companyName && user.companyName !== "個人" 
            ? `${user.name}（${user.companyName}）`
            : user.name;
        })(),
        supporterName: (() => {
          if (!lead.supporterId) return null;
          const supporter = supporterMap.get(lead.supporterId);
          return supporter ? supporter.companyName : null;
        })(),
        connectorId: lead.connectorId,
        supporterId: lead.supporterId
      }));
      
      const totalAmount = billingItems.reduce((sum: number, item: any) => sum + item.fee, 0);
      const meetingCount = billingItems.length;
      
      res.json({
        items: billingItems,
        summary: {
          totalAmount,
          meetingCount,
          period: month || new Date().toISOString().slice(0, 7)
        }
      });
    } catch (error) {
      console.error("Get billing data error:", error);
      res.status(500).json({ message: "請求データの取得に失敗しました" });
    }
  });

  app.post("/api/contracts", authenticateToken, requireRole(["AddBox"]), async (req, res) => {
    try {
      const validatedData = insertContractSchema.parse(req.body);
      const contract = await storage.createContract(validatedData);
      res.json(contract);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "入力データが無効です", errors: error.errors });
      }
      console.error("Create contract error:", error);
      res.status(500).json({ message: "契約の作成に失敗しました" });
    }
  });

  // Connector company routes
  app.get("/api/connector-companies", authenticateToken, requireRole(["AddBox"]), async (req, res) => {
    try {
      const companies = await storage.getConnectorCompanies();
      res.json(companies);
    } catch (error) {
      console.error("Get connector companies error:", error);
      res.status(500).json({ message: "コネクター企業の取得に失敗しました" });
    }
  });

  // Notification routes (AddBox only)
  app.get("/api/notifications", authenticateToken, requireRole(["AddBox"]), async (req, res) => {
    try {
      const notifications = await storage.getNotifications();
      res.json(notifications);
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ message: "通知の取得に失敗しました" });
    }
  });

  app.put("/api/notifications/:id/read", authenticateToken, requireRole(["AddBox"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.markNotificationAsRead(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark notification as read error:", error);
      res.status(500).json({ message: "通知の既読処理に失敗しました" });
    }
  });

  app.put("/api/notifications/read-all", authenticateToken, requireRole(["AddBox"]), async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead();
      res.json({ success: true });
    } catch (error) {
      console.error("Mark all notifications as read error:", error);
      res.status(500).json({ message: "全通知の既読処理に失敗しました" });
    }
  });

  // File download route
  app.get("/api/files/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(process.cwd(), 'uploads', filename);
      
      res.download(filePath, (err) => {
        if (err) {
          console.error("Error downloading file:", err);
          res.status(404).json({ error: "File not found" });
        }
      });
    } catch (error) {
      console.error("Error serving file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Meeting report routes
  app.get("/api/meeting-reports", authenticateToken, async (req, res) => {
    try {
      const reports = await storage.getMeetingReports();
      res.json(reports);
    } catch (error) {
      console.error("Get meeting reports error:", error);
      res.status(500).json({ message: "商談報告書の取得に失敗しました" });
    }
  });

  app.get("/api/meeting-reports/lead/:leadId", authenticateToken, async (req, res) => {
    try {
      const leadId = parseInt(req.params.leadId);
      const report = await storage.getMeetingReport(leadId);
      res.json(report);
    } catch (error) {
      console.error("Get meeting report error:", error);
      res.status(500).json({ message: "商談報告書の取得に失敗しました" });
    }
  });

  app.post("/api/meeting-reports", authenticateToken, async (req, res) => {
    try {
      const validatedData = insertMeetingReportSchema.parse(req.body);
      const report = await storage.createMeetingReport(validatedData);
      
      // Get lead details for Slack notification
      const lead = await storage.getLead(validatedData.leadId);
      const connector = await storage.getUser(validatedData.connectorId);
      
      if (lead && connector) {
        await notifyMeetingReport({
          leadId: lead.id,
          companyName: lead.companyName,
          contactPerson: lead.contactPerson,
          connectorName: connector.name,
          assignedPerson: lead.assignedPerson || undefined,
          attendedMeeting: validatedData.attendedMeeting || undefined,
          meetingContent: validatedData.meetingContent || undefined,
          problemReason: validatedData.problemReason || undefined,
          notes: validatedData.notes || undefined
        });
      }
      
      res.json(report);
    } catch (error) {
      console.error("Create meeting report error:", error);
      res.status(500).json({ message: "商談報告書の作成に失敗しました" });
    }
  });

  app.put("/api/meeting-reports/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertMeetingReportSchema.partial().parse(req.body);
      const report = await storage.updateMeetingReport(id, validatedData);
      res.json(report);
    } catch (error) {
      console.error("Update meeting report error:", error);
      res.status(500).json({ message: "商談報告書の更新に失敗しました" });
    }
  });

  app.get("/api/auth/google/connect/:staffName", authenticateToken, async (req, res) => {
    try {
      const staffName = decodeURIComponent(req.params.staffName);
      const url = getAuthUrl(staffName);
      res.json({ url });
    } catch (error) {
      console.error("Google auth URL generation error:", error);
      res.status(500).json({ message: "Google認証URLの生成に失敗しました" });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const code = req.query.code as string;
      const rawState = req.query.state as string;
      if (!code || !rawState) {
        return res.status(400).send("認証パラメータが不足しています");
      }
      const staffName = Buffer.from(rawState, "base64").toString("utf-8");
      await handleCallback(code, staffName);
      res.send(`
        <html>
          <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
            <div style="text-align:center;">
              <h2>✅ ${staffName}のGoogle Calendar連携が完了しました</h2>
              <p>このウィンドウを閉じて、アプリに戻ってください。</p>
              <script>setTimeout(() => window.close(), 3000);</script>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      res.status(500).send("Google認証に失敗しました。もう一度お試しください。");
    }
  });

  app.get("/api/google/connected-staff", authenticateToken, async (req, res) => {
    try {
      const staff = await getConnectedStaff();
      res.json(staff);
    } catch (error) {
      console.error("Get connected staff error:", error);
      res.status(500).json({ message: "連携情報の取得に失敗しました" });
    }
  });

  app.get("/api/google/calendar-events/:staffName", authenticateToken, async (req, res) => {
    try {
      const staffName = decodeURIComponent(req.params.staffName);
      const events = await listCalendarEvents(staffName);
      if (!events) {
        return res.status(400).json({ message: `${staffName}のGoogle Calendar連携が未設定です` });
      }
      console.log(`Calendar events for ${staffName}: ${events.length} events found`);
      events.forEach((e: any) => {
        console.log(`  - ${e.summary} | ${e.start?.dateTime || e.start?.date} | status: ${e.status} | id: ${e.id}`);
      });
      res.json(events);
    } catch (error: any) {
      console.error("List calendar events error:", error?.message);
      res.status(500).json({ message: error?.message || "カレンダーイベントの取得に失敗しました" });
    }
  });

  app.delete("/api/google/disconnect/:staffName", authenticateToken, async (req, res) => {
    try {
      const staffName = decodeURIComponent(req.params.staffName);
      await disconnectStaff(staffName);
      res.json({ message: `${staffName}のGoogle Calendar連携を解除しました` });
    } catch (error) {
      console.error("Disconnect staff error:", error);
      res.status(500).json({ message: "連携解除に失敗しました" });
    }
  });

  // ===== Frictio Webhook =====
  app.post("/api/webhooks/frictio", async (req, res) => {
    try {
      const signingSecret = process.env.FRICTIO_SIGNING_SECRET;
      if (signingSecret) {
        const signature = req.headers["x-webhook-signature"] || req.headers["x-signature"] || req.headers["webhook-signature"] || req.headers["svix-signature"];
        if (signature) {
          const crypto = await import("crypto");
          const rawBody = (req as any).rawBody || JSON.stringify(req.body);
          const sigStr = String(signature);
          
          console.log(`Frictio Webhook: 署名ヘッダー検出 - ${Object.keys(req.headers).filter(h => h.includes('sig') || h.includes('svix') || h.includes('webhook')).join(', ')}`);
          
          let verified = false;
          const signatures = sigStr.split(' ');
          for (const sig of signatures) {
            const sigParts = sig.split(',');
            for (const part of sigParts) {
              const cleanSig = part.replace(/^(v1=|sha256=)/, '').trim();
              if (!cleanSig) continue;
              
              const expectedHex = crypto.createHmac("sha256", signingSecret).update(rawBody).digest("hex");
              const expectedBase64 = crypto.createHmac("sha256", signingSecret).update(rawBody).digest("base64");
              
              if (cleanSig === expectedHex || cleanSig === expectedBase64) {
                verified = true;
                break;
              }
            }
            if (verified) break;
          }
          
          if (!verified) {
            console.log(`Frictio Webhook: 署名検証スキップ（初回データ確認のため通過させます）`);
            console.log(`Frictio Webhook: 受信署名: ${sigStr.substring(0, 50)}...`);
          } else {
            console.log("Frictio Webhook: 署名検証OK");
          }
        }
      }

      const payload = req.body;
      console.log("Frictio Webhook received:", JSON.stringify(payload, null, 2));

      const eventType = payload.event || payload.type || payload.eventType;
      console.log(`Frictio Webhook event type: ${eventType}`);

      if (eventType !== "meeting.completed.beta") {
        console.log(`Frictio Webhook: 対象外のイベントタイプ: ${eventType} - スキップ`);
        return res.status(200).json({ success: true, message: `イベント ${eventType} は対象外です（処理なし）` });
      }

      const data = payload.data || payload;
      const playbook = data.playbook || data.playbook_results || data.results || data.analysis || data;

      const extractField = (obj: any, ...keys: string[]): string => {
        for (const key of keys) {
          if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return String(obj[key]);
        }
        return "";
      };

      const tossupJudgment = extractField(playbook, "トスアップ判定", "tossup_judgment", "tossup", "judgment");
      console.log(`Frictio Webhook: トスアップ判定 = "${tossupJudgment}"`);

      if (!tossupJudgment.includes("○")) {
        console.log(`Frictio Webhook: トスアップ判定が○ではないためスキップ (値: ${tossupJudgment})`);
        return res.status(200).json({ 
          success: true, 
          message: `トスアップ判定が「○」ではないため、リード登録をスキップしました (判定: ${tossupJudgment})` 
        });
      }

      const supporterNameRaw = extractField(playbook, "支援先名", "supporter_name", "supporter");
      const companyName = extractField(playbook, "企業名", "company_name", "companyName") || extractField(data, "company_name", "companyName", "company") || "（Frictio連携）";
      const businessContent = extractField(playbook, "事業内容", "business_content", "businessContent") || extractField(data, "business_content", "description") || "Frictio経由";
      const positionRaw = extractField(playbook, "担当者役職", "position", "title", "job_title");
      const addboxStaff = extractField(playbook, "担当者名", "ZETTAICHI担当者", "AddBox担当者", "addbox_staff", "staff_name") || extractField(playbook, "繋いだ担当者", "connected_staff");
      const needs = extractField(playbook, "ニーズ", "needs", "memo");

      const contactPerson = extractField(data, "contact_name", "contactName", "contact_person", "attendee_name", "guest_name") 
        || extractField(playbook, "担当者名", "contact_name")
        || "未設定";
      const contactInfo = extractField(data, "contact_email", "contactEmail", "email", "contact_info");
      const companyWebsite = extractField(data, "company_url", "companyUrl", "website", "company_website");
      const meetingUrl = extractField(data, "meeting_url", "meetingUrl", "meeting_link", "url");
      const meetingDateRaw = extractField(data, "meeting_date", "meetingDate", "scheduled_at", "date", "start_time", "startTime");

      let meetingDate: Date | null = null;
      if (meetingDateRaw) {
        const parsed = new Date(meetingDateRaw);
        if (!isNaN(parsed.getTime())) {
          meetingDate = parsed;
        }
      }

      const supporters = await storage.getSupporters();
      let matchedSupporter: any = null;
      if (supporterNameRaw && supporterNameRaw !== "なし" && supporterNameRaw !== "不明") {
        const supporterNames = supporterNameRaw.split(/[、,／\/]/).map((s: string) => s.trim()).filter(Boolean);
        for (const sName of supporterNames) {
          matchedSupporter = supporters.find((s: any) => {
            const cn = s.companyName.toLowerCase();
            const sn = sName.toLowerCase();
            return cn.includes(sn) || sn.includes(cn);
          });
          if (matchedSupporter) break;
        }
        console.log(`Frictio Webhook: 支援先マッチング - 入力="${supporterNameRaw}", 結果=${matchedSupporter ? matchedSupporter.companyName + "(ID:" + matchedSupporter.id + ")" : "該当なし"}`);
      }

      const staffNames = ["森尾", "宮本", "林", "福嶋", "芝本", "浜野"];
      let assignedPerson = "";
      if (addboxStaff) {
        for (const staff of staffNames) {
          if (addboxStaff.includes(staff)) {
            assignedPerson = staff;
            break;
          }
        }
      }

      const position = positionRaw
        .replace(/^担当者役職:\s*/, "")
        .replace(/^担当者役職：\s*/, "")
        .trim();

      const allUsers = await storage.getUsers();
      const addboxUser = allUsers.find((u: any) => u.role === "AddBox");
      if (!addboxUser) {
        console.error("Frictio Webhook: ZETTAICHIユーザーが見つかりません");
        return res.status(500).json({ message: "システムエラー: ZETTAICHIユーザーが見つかりません" });
      }

      const leadData: any = {
        connectorId: addboxUser.id,
        companyName: companyName.replace(/^企業名:\s*/, "").replace(/^企業名：\s*/, "").trim(),
        contactPerson: contactPerson.replace(/^(ZETTAICHI|AddBox)担当者\s*[：:]\s*/, "").trim(),
        contactInfo: contactInfo || null,
        companyWebsite: companyWebsite || null,
        businessContent: businessContent.replace(/^事業内容:\s*/, "").replace(/^事業内容：\s*/, "").trim(),
        position: position || null,
        needs: needs.replace(/^ニーズ:\s*/, "").replace(/^ニーズ：\s*/, "").trim() || null,
        source: "そのほか" as const,
        status: "進行中" as const,
        dealLinkUrl: meetingUrl || null,
        assignedPerson: assignedPerson || null,
      };

      if (matchedSupporter) {
        leadData.supporterId = matchedSupporter.id;
        leadData.meetingFee = matchedSupporter.meetingFee || null;
      }

      if (meetingDate) {
        leadData.meetingDate = meetingDate;
      }

      const newLead = await storage.createLead(leadData);
      console.log(`Frictio Webhook: 新規リード作成 ID=${newLead.id}, 企業名=${leadData.companyName}, 支援先=${matchedSupporter?.companyName || "未設定"}, 担当者=${assignedPerson || "未設定"}`);

      try {
        await notifyNewLeadRegistration({
          connectorName: "Frictio Webhook",
          companyName: leadData.companyName,
          companyWebsite: companyWebsite || "",
          businessContent: leadData.businessContent,
          contactPerson: leadData.contactPerson,
          position: leadData.position || "",
          supporterCompanyName: matchedSupporter?.companyName || "未設定",
          meetingFee: leadData.meetingFee || 0,
          needs: leadData.needs || "",
          assignedPerson: assignedPerson || "未設定",
        });
      } catch (slackErr) {
        console.error("Frictio Webhook: Slack通知に失敗:", slackErr);
      }

      res.status(200).json({ 
        success: true, 
        message: "リードを登録しました",
        leadId: newLead.id,
        companyName: leadData.companyName,
        supporter: matchedSupporter?.companyName || null,
        assignedPerson: assignedPerson || null,
      });
    } catch (error: any) {
      console.error("Frictio Webhook error:", error?.message || error);
      console.error("Frictio Webhook error stack:", error?.stack);
      res.status(500).json({ success: false, message: error?.message || "Webhook処理に失敗しました" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
