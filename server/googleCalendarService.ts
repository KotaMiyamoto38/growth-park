import { google } from "googleapis";
import { db } from "./db";
import { googleTokens } from "@shared/schema";
import { eq } from "drizzle-orm";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI
  || (process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}/api/auth/google/callback`
    : "http://localhost:5000/api/auth/google/callback");

function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

export function getAuthUrl(staffName: string) {
  console.log(`Google OAuth: Using redirect URI: ${REDIRECT_URI}`);
  const oauth2Client = createOAuth2Client();
  const encodedState = Buffer.from(staffName, "utf-8").toString("base64");
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/userinfo.email"],
    state: encodedState,
  });
  console.log(`Google OAuth: Generated auth URL for ${staffName} (state: ${encodedState})`);
  return url;
}

export async function handleCallback(code: string, staffName: string) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email || null;

  const existing = await db.select().from(googleTokens).where(eq(googleTokens.staffName, staffName));

  if (existing.length > 0) {
    await db.update(googleTokens)
      .set({
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token || existing[0].refreshToken,
        tokenExpiry: new Date(tokens.expiry_date!),
        email,
        updatedAt: new Date(),
      })
      .where(eq(googleTokens.staffName, staffName));
  } else {
    await db.insert(googleTokens).values({
      staffName,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      tokenExpiry: new Date(tokens.expiry_date!),
      email,
    });
  }

  return { email, staffName };
}

async function getAuthenticatedClient(staffName: string) {
  const tokenRows = await db.select().from(googleTokens).where(eq(googleTokens.staffName, staffName));
  if (tokenRows.length === 0) return null;

  const token = tokenRows[0];
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.tokenExpiry.getTime(),
  });

  oauth2Client.on("tokens", async (newTokens) => {
    await db.update(googleTokens)
      .set({
        accessToken: newTokens.access_token || token.accessToken,
        tokenExpiry: new Date(newTokens.expiry_date!),
        updatedAt: new Date(),
      })
      .where(eq(googleTokens.staffName, staffName));
  });

  return oauth2Client;
}

export async function createCalendarEvent(
  staffName: string,
  summary: string,
  description: string,
  meetingDate: string,
  meetingUrl?: string
) {
  const auth = await getAuthenticatedClient(staffName);
  if (!auth) {
    console.log(`Google Calendar: ${staffName}のOAuth認証が未設定です`);
    return null;
  }

  const calendar = google.calendar({ version: "v3", auth });

  const startDateTime = formatJSTDateTime(meetingDate);
  const startMs = new Date(meetingDate).getTime();
  const endDateTime = formatJSTDateTime(new Date(startMs + 60 * 60 * 1000).toISOString());

  console.log(`Google Calendar: Creating event - start: ${startDateTime}, end: ${endDateTime}`);

  const event: any = {
    summary,
    description,
    start: {
      dateTime: startDateTime,
      timeZone: "Asia/Tokyo",
    },
    end: {
      dateTime: endDateTime,
      timeZone: "Asia/Tokyo",
    },
  };

  if (meetingUrl) {
    event.location = meetingUrl;
  }

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: event,
  });
  console.log(`Google Calendar: ${staffName}のカレンダーに予定を作成しました - ${summary}`);
  console.log(`Google Calendar: Event ID: ${response.data.id}, Link: ${response.data.htmlLink}`);
  console.log(`Google Calendar: Event status: ${response.data.status}, creator: ${response.data.creator?.email}, organizer: ${response.data.organizer?.email}`);
  return response.data;
}

function formatJSTDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const jstOffset = 9 * 60 * 60 * 1000;
  const jst = new Date(d.getTime() + jstOffset);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  const hours = String(jst.getUTCHours()).padStart(2, '0');
  const minutes = String(jst.getUTCMinutes()).padStart(2, '0');
  const seconds = String(jst.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+09:00`;
}

export async function getConnectedStaff() {
  const tokens = await db.select({
    staffName: googleTokens.staffName,
    email: googleTokens.email,
  }).from(googleTokens);
  return tokens;
}

export async function listCalendarEvents(staffName: string) {
  const auth = await getAuthenticatedClient(staffName);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const response = await calendar.events.list({
    calendarId: "primary",
    maxResults: 20,
    orderBy: "startTime",
    singleEvents: true,
    timeMin: new Date("2026-01-01").toISOString(),
  });
  return response.data.items || [];
}

export async function disconnectStaff(staffName: string) {
  await db.delete(googleTokens).where(eq(googleTokens.staffName, staffName));
}
