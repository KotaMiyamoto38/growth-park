import { type ChatPostMessageArguments, type Logger, LogLevel, WebClient } from "@slack/web-api";

// SDK logs can include server response or request contents. Log only sanitized
// failure codes in this module instead.
const sdkLogger: Logger = {
  debug() {}, info() {}, warn() {}, error() {}, setLevel() {}, setName() {},
  getLevel: () => LogLevel.ERROR,
};

function logSlackFailure(event: string, error: unknown): void {
  const knownCodes = new Set([
    "invalid_auth", "channel_not_found", "not_in_channel", "missing_scope",
    "account_inactive", "token_revoked", "ratelimited", "request_timeout",
    "slack_webapi_platform_error", "slack_webapi_request_error", "slack_webapi_rate_limited_error",
  ]);
  const failure = error as { code?: unknown; data?: { error?: unknown } } | undefined;
  const candidate = failure?.data?.error || failure?.code;
  const code = typeof candidate === "string" && knownCodes.has(candidate) ? candidate : "notification_failed";
  // Do not log the SDK error object: it may contain tokens or message contents.
  console.error(`Slack ${event} failed: ${code}`);
}

// 内部スタッフの役職マッピング
const staffPositions: Record<string, string> = {
  "森尾": "代表取締役",
  "宮本": "取締役",
  "林": "マネージャー",
  "福嶋": "エグゼクティブ",
  "芝本": "アソシエイト",
  "棗": "コネクター"
};

/**
 * Sends a structured message to a Slack channel using the Slack Web API
 */
async function sendSlackMessage(
  message: ChatPostMessageArguments
): Promise<string | undefined> {
  try {
    // Legacy events remain optional and never use the lead-only destination.
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token || !process.env.SLACK_CHANNEL_ID) return undefined;
    const legacySlack = new WebClient(token, { logger: sdkLogger });
    const response = await legacySlack.chat.postMessage(message);
    return response.ts;
  } catch (error) {
    logSlackFailure('legacy notification', error);
    throw error;
  }
}

/**
 * 新規コネクター登録通知をSlackに送信
 */
export async function notifyNewConnectorRegistration(userData: {
  name: string;
  email: string;
  companyName?: string;
}): Promise<void> {
  try {
    const channel = process.env.SLACK_CHANNEL_ID!;
    
    let notificationText = `*名前:* ${userData.name}\n*メールアドレス:* ${userData.email}`;
    
    if (userData.companyName) {
      notificationText += `\n*会社名:* ${userData.companyName}`;
    }
    
    const sent = await sendSlackMessage({
      channel,
      text: '🎉 新規コネクター登録',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '<!channel> 新規コネクター登録がありました'
          }
        },
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🎉 新規コネクター登録',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: notificationText
          }
        },
        {
          type: 'divider'
        }
      ]
    });
    
    if (sent) console.log('Slack notification sent for new connector registration');
  } catch (error) {
    logSlackFailure('connector registration', error);
  }
}

export class SlackLeadNotConfiguredError extends Error {
  constructor() {
    super("Slack lead notification destination is not configured");
    this.name = "SlackLeadNotConfiguredError";
  }
}

// Production lead alerts and the administrator connection test share this path.
type LeadChannelMessage = Pick<Extract<ChatPostMessageArguments, { blocks: unknown }>, "text" | "blocks">;
async function postLeadChannelMessage(message: LeadChannelMessage): Promise<void> {
  const token = process.env.SLACK_LEAD_BOT_TOKEN;
  const channel = process.env.SLACK_LEAD_CHANNEL_ID;
  // Fail closed: no fallback to the previous workspace or its channel.
  if (!token || !channel) throw new SlackLeadNotConfiguredError();
  const slack = new WebClient(token, {
    logger: sdkLogger,
    retryConfig: { retries: 0 },
    rejectRateLimitedCalls: true,
    timeout: 10000,
  });
  await slack.chat.postMessage({
    ...message,
    channel,
    parse: "none",
    unfurl_links: false,
    unfurl_media: false,
  });
}

export async function sendSlackLeadTestNotification(): Promise<void> {
  const text = "【接続テスト】Growth ParkからのSlack通知です。新規商談は登録していません。";
  await postLeadChannelMessage({
    text,
    blocks: [{ type: "section", text: { type: "plain_text", text, emoji: false } }],
  });
}

/**
 * 新規商談登録通知をSlackに送信
 */
export async function notifyNewLeadRegistration(leadData: {
  leadId: number;
  connectorName: string;
  monthlyLeadCount: number;
  companyName: string;
  companyWebsite?: string | null;
  businessContent: string;
  position?: string | null;
  contactPerson: string;
  needs?: string | null;
}): Promise<void> {
  try {
    // Keep every submitted value on one line. Long descriptions retain more
    // detail and are grouped into sections under Slack's 3000-character limit.
    const singleLine = (value: string | null | undefined, limit = 400): string => {
      const normalized = (value || "").replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim() || "未設定";
      const suffix = "…（続きは商談管理で確認）";
      return normalized.length <= limit ? normalized
        : `${normalized.slice(0, limit - suffix.length).replace(/[\uD800-\uDBFF]$/, "")}${suffix}`;
    };
    const count = Number.isSafeInteger(leadData.monthlyLeadCount) && leadData.monthlyLeadCount > 0
      ? `${leadData.monthlyLeadCount}件目の` : "新しい";
    const title = `${singleLine(leadData.connectorName, 100)}から${count}トスアップです🎉`;
    // Plain-text blocks prevent all submitted names, content and URLs from
    // becoming Slack mentions or markup. Only the fixed app link is actionable.
    const fields = [
      ["企業名", leadData.companyName, 400],
      ["HP", leadData.companyWebsite, 400],
      ["事業内容", leadData.businessContent, 2500],
      ["役職", leadData.position, 400],
      ["お名前", leadData.contactPerson, 400],
      ["ニーズ", leadData.needs, 2500],
    ] as const;
    const bodySections: string[] = [];
    let section = "";
    for (const [label, value, limit] of fields) {
      const line = `${label}: ${singleLine(value, limit)}`;
      if (section && section.length + 1 + line.length > 3000) {
        bodySections.push(section);
        section = line;
      } else {
        section = section ? `${section}\n${line}` : line;
      }
    }
    if (section) bodySections.push(section);
    await postLeadChannelMessage({
      // The notification preview uses mrkdwn semantics even when blocks are
      // plain text, so do not allow a submitted connector name to become markup.
      text: title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
      blocks: [
        { type: "header", text: { type: "plain_text", text: title, emoji: false } },
        ...bodySections.map(text => ({
          type: "section" as const, text: { type: "plain_text" as const, text, emoji: false },
        })),
        { type: "context", elements: [{ type: "plain_text", text: `商談ID: ${leadData.leadId}`, emoji: false }] },
        { type: "section", text: { type: "mrkdwn", text: "<https://growth-park.onrender.com/leads|商談管理を開く>" } },
      ],
    });
    console.log("Slack lead notification sent");
  } catch (error) {
    // A notification failure must not roll back a successfully registered lead.
    if (error instanceof SlackLeadNotConfiguredError) {
      console.warn("Slack lead notification skipped: dedicated destination is not configured");
    } else {
      logSlackFailure("lead registration", error);
    }
  }
}

/**
 * 商談報告書通知をSlackに送信
 */
export async function notifyMeetingReport(reportData: {
  leadId: number;
  companyName: string;
  contactPerson: string;
  connectorName: string;
  assignedPerson?: string;
  attendedMeeting?: boolean;
  meetingContent?: string;
  problemReason?: string;
  notes?: string;
}): Promise<void> {
  try {
    const channel = process.env.SLACK_CHANNEL_ID!;

    let reportText = `*コネクター:* ${reportData.connectorName}\n`;
    reportText += `*企業名:* ${reportData.companyName}\n`;
    reportText += `*担当者:* ${reportData.contactPerson}\n`;
    
    // AddBox担当者の役職と名前を表示
    if (reportData.assignedPerson) {
      const assignedPersonPosition = staffPositions[reportData.assignedPerson];
      const assignedPersonText = assignedPersonPosition 
        ? `役職: ${assignedPersonPosition}\n${reportData.assignedPerson}`
        : reportData.assignedPerson;
      reportText += `*ZETTAICHI担当者:*\n${assignedPersonText}\n`;
    }
    
    if (reportData.attendedMeeting !== undefined) {
      reportText += `*商談同席:* ${reportData.attendedMeeting ? 'あり' : 'なし'}\n`;
    }
    
    if (reportData.meetingContent) {
      reportText += `*商談内容:* ${reportData.meetingContent}\n`;
    }
    
    if (reportData.problemReason) {
      reportText += `*問題理由:* ${reportData.problemReason}\n`;
    }
    
    if (reportData.notes) {
      reportText += `*備考:* ${reportData.notes}`;
    }

    await sendSlackMessage({
      channel,
      text: '📝 商談報告書提出',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '<!channel> 商談報告書が提出されました'
          }
        },
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📝 商談報告書',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: reportText
          }
        }
      ]
    });
  } catch (error) {
    logSlackFailure('meeting report', error);
  }
}

export { sendSlackMessage };
