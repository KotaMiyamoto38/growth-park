import { MailService } from '@sendgrid/mail';
import { storage } from './storage';

let mailService: MailService | null = null;

// Initialize SendGrid if API key is available
if (process.env.SENDGRID_API_KEY) {
  mailService = new MailService();
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}

interface EmailParams {
  to: string[];
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!mailService) {
    console.log('SendGrid API key not configured, email notification skipped');
    return false;
  }

  try {
    await mailService.send({
      to: params.to,
      from: 'no-reply@growth-park.com', // This should be configured with your verified sender
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

export async function notifyNewLead(leadData: {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  connectorName: string;
  supporterName: string;
}) {
  // Create notification in database
  await storage.createNotification({
    title: '新規リード登録',
    message: `${leadData.connectorName}様から新しいリードが登録されました: ${leadData.companyName} (${leadData.contactPerson})`,
    type: 'new_lead',
    isRead: false,
  });

  // Send email to AddBox team members
  const addboxEmails = [
    'k.miyamoto@addbox.co.jp',
    's.morio@addbox.co.jp', 
    'f.hayashi@addbox.co.jp',
    'r.fukushima@addbox.co.jp'
  ];

  const emailSubject = '【Growth Park】新規リード登録通知';
  const emailText = `
新しいリードが登録されました。

■ 企業情報
企業名: ${leadData.companyName}
担当者: ${leadData.contactPerson}
メールアドレス: ${leadData.email}
電話番号: ${leadData.phone}

■ 紹介情報
コネクター: ${leadData.connectorName}
支援先: ${leadData.supporterName}

Growth Parkダッシュボードで詳細を確認してください。
  `;

  const emailHtml = `
    <h2>【Growth Park】新規リード登録通知</h2>
    <p>新しいリードが登録されました。</p>
    
    <h3>■ 企業情報</h3>
    <ul>
      <li><strong>企業名:</strong> ${leadData.companyName}</li>
      <li><strong>担当者:</strong> ${leadData.contactPerson}</li>
      <li><strong>メールアドレス:</strong> ${leadData.email}</li>
      <li><strong>電話番号:</strong> ${leadData.phone}</li>
    </ul>
    
    <h3>■ 紹介情報</h3>
    <ul>
      <li><strong>コネクター:</strong> ${leadData.connectorName}</li>
      <li><strong>支援先:</strong> ${leadData.supporterName}</li>
    </ul>
    
    <p><strong>Growth Parkダッシュボードで詳細を確認してください。</strong></p>
  `;

  return await sendEmail({
    to: addboxEmails,
    subject: emailSubject,
    text: emailText,
    html: emailHtml,
  });
}