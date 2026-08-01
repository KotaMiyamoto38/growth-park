import { type ChatPostMessageArguments, WebClient } from "@slack/web-api";

if (!process.env.SLACK_BOT_TOKEN) {
  throw new Error("SLACK_BOT_TOKEN environment variable must be set");
}

if (!process.env.SLACK_CHANNEL_ID) {
  throw new Error("SLACK_CHANNEL_ID environment variable must be set");
}

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

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
    const response = await slack.chat.postMessage(message);
    return response.ts;
  } catch (error) {
    console.error('Error sending Slack message:', error);
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
    
    await sendSlackMessage({
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
    
    console.log('Slack notification sent for new connector registration');
  } catch (error) {
    console.error('Failed to send Slack notification for new connector registration:', error);
  }
}

/**
 * 新規商談登録通知をSlackに送信
 */
export async function notifyNewLeadRegistration(leadData: {
  connectorName: string;
  companyName: string;
  companyWebsite: string;
  businessContent: string;
  contactPerson: string;
  position: string;
  supporterCompanyName: string;
  meetingFee: number;
  needs: string;
  assignedPerson: string;
}): Promise<void> {
  try {
    const channel = process.env.SLACK_CHANNEL_ID!;
    
    // 担当者の役職を取得
    const assignedPersonPosition = staffPositions[leadData.assignedPerson];
    const assignedPersonText = assignedPersonPosition 
      ? `役職: ${assignedPersonPosition}\n${leadData.assignedPerson}`
      : leadData.assignedPerson;
    
    await sendSlackMessage({
      channel,
      text: '💼 新規商談登録',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '<!channel> 新規商談登録がありました'
          }
        },
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '💼 新規商談登録',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*コネクター:* ${leadData.connectorName}\n*企業名:* ${leadData.companyName}\n*HP:* ${leadData.companyWebsite || '未記入'}\n*担当者:* ${leadData.contactPerson}\n*役職:* ${leadData.position || '未記入'}\n*事業内容:* ${leadData.businessContent}\n*ニーズ:* ${leadData.needs}\n*支援先:* ${leadData.supporterCompanyName}\n*商談フィー:* ¥${leadData.meetingFee.toLocaleString()}\n*ZETTAICHI担当者:*\n${assignedPersonText}`
          }
        },
        {
          type: 'divider'
        }
      ]
    });
    
    console.log('Slack notification sent for new lead registration');
  } catch (error) {
    console.error('Failed to send Slack notification for new lead registration:', error);
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
    console.error('Error sending Slack message for meeting report:', error);
  }
}

export { sendSlackMessage };