import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { WebClient } from '@slack/web-api';

// Import without credentials must not prevent application startup.
delete process.env.SLACK_BOT_TOKEN;
delete process.env.SLACK_CHANNEL_ID;
delete process.env.SLACK_LEAD_BOT_TOKEN;
delete process.env.SLACK_LEAD_CHANNEL_ID;
const { notifyNewLeadRegistration, notifyNewConnectorRegistration, notifyMeetingReport } = await import('./slackService');

const lead = {
  leadId: 123,
  companyName: '株式会社テスト <!channel>',
  connectorName: '紹介者 <@U123> & <https://example.com|リンク>',
  monthlyLeadCount: 3,
  companyWebsite: 'https://example.com/company',
  businessContent: '事業支援\n\n<!everyone>',
  position: '代表取締役',
  contactPerson: '担当者 <@U456>',
  needs: '営業支援 <https://example.com|相談>',
  // Extra database fields must never reach Slack.
  contactInfo: 'private@example.com',
  meetingFee: 987654,
  password: 'PRIVATE_PASSWORD',
  assignedPerson: 'PRIVATE_ASSIGNEE',
  supporterCompanyName: 'PRIVATE_SUPPORTER',
};

test('lead notifications use only the dedicated channel and safe minimal content', async () => {
  const calls: any[] = [];
  const transport = mock.method(WebClient.prototype, 'apiCall', async function (this: WebClient, method: string, args: any) {
    calls.push({ token: this.token, method, args });
    return { ok: true, ts: '123.456' };
  });
  const warn = mock.method(console, 'warn', () => {});
  const log = mock.method(console, 'log', () => {});
  try {
    process.env.SLACK_BOT_TOKEN = 'legacy-test-token';
    process.env.SLACK_CHANNEL_ID = 'C_LEGACY';
    await notifyNewLeadRegistration(lead);
    process.env.SLACK_LEAD_BOT_TOKEN = 'new-test-token';
    await notifyNewLeadRegistration(lead);
    delete process.env.SLACK_LEAD_BOT_TOKEN;
    process.env.SLACK_LEAD_CHANNEL_ID = 'C_NEW';
    await notifyNewLeadRegistration(lead);
    assert.equal(calls.length, 0, 'partial new configuration must never fall back to legacy');

    process.env.SLACK_LEAD_BOT_TOKEN = 'new-test-token';
    await notifyNewLeadRegistration(lead);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].token, 'new-test-token');
    assert.equal(calls[0].method, 'chat.postMessage');
    const message = calls[0].args;
    assert.equal(message.channel, 'C_NEW');
    assert.equal(message.parse, 'none');
    assert.equal(message.unfurl_links, false);
    assert.equal(message.unfurl_media, false);
    assert.equal(message.blocks[0].text.type, 'plain_text');
    assert.equal(message.blocks[0].text.text, `${lead.connectorName}から3件目のトスアップです🎉`);
    assert.equal(message.text, '紹介者 &lt;@U123&gt; &amp; &lt;https://example.com|リンク&gt;から3件目のトスアップです🎉');
    assert.doesNotMatch(message.text, /<|>/, 'notification previews must not contain actionable mentions or links');
    assert.equal(message.blocks[1].text.type, 'plain_text');
    assert.deepEqual(message.blocks[1].text.text.split('\n'), [
      `企業名: ${lead.companyName}`,
      `HP: ${lead.companyWebsite}`,
      '事業内容: 事業支援 <!everyone>',
      `役職: ${lead.position}`,
      `お名前: ${lead.contactPerson}`,
      `ニーズ: ${lead.needs}`,
    ]);
    assert.equal(message.blocks[2].elements[0].text, '商談ID: 123');
    const markdown = message.blocks.filter((block: any) => block.text?.type === 'mrkdwn');
    assert.deepEqual(markdown, [{ type: 'section', text: { type: 'mrkdwn', text: '<https://growth-park.onrender.com/leads|商談管理を開く>' } }]);
    assert.doesNotMatch(JSON.stringify(message), /PRIVATE|private@example|987654/);

    await notifyNewConnectorRegistration({ name: '登録者', email: 'legacy@example.com' });
    await notifyMeetingReport({ leadId: 123, companyName: '企業', contactPerson: '担当者', connectorName: '紹介者' });
    assert.deepEqual(calls.slice(1).map(call => [call.token, call.args.channel]), [
      ['legacy-test-token', 'C_LEGACY'], ['legacy-test-token', 'C_LEGACY'],
    ]);
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_CHANNEL_ID;
    await notifyNewConnectorRegistration({ name: '登録者', email: 'legacy@example.com' });
    await notifyMeetingReport({ leadId: 123, companyName: '企業', contactPerson: '担当者', connectorName: '紹介者' });
    assert.equal(calls.length, 3, 'legacy events must not use the new lead-only destination');
  } finally {
    transport.mock.restore();
    warn.mock.restore();
    log.mock.restore();
  }
});

test('lead notification fields keep one-line order, missing values and Slack length limits', async () => {
  process.env.SLACK_LEAD_BOT_TOKEN = 'new-test-token';
  process.env.SLACK_LEAD_CHANNEL_ID = 'C_NEW';
  const calls: any[] = [];
  const transport = mock.method(WebClient.prototype, 'apiCall', async (_method: string, args: any) => {
    calls.push(args);
    return { ok: true, ts: '123.456' };
  });
  const log = mock.method(console, 'log', () => {});
  try {
    const long = '長い文章🎉\r\n'.repeat(1000);
    await notifyNewLeadRegistration({
      ...lead, connectorName: long, monthlyLeadCount: Number.MAX_SAFE_INTEGER,
      companyName: long, companyWebsite: long, businessContent: long,
      position: long, contactPerson: long, needs: long,
    });
    const message = calls[0];
    assert.ok(message.blocks[0].text.text.length <= 150);
    const sections = message.blocks.filter((block: any) => block.type === 'section' && block.text.type === 'plain_text');
    assert.ok(sections.length > 1, 'long fields should use multiple sections rather than be cut to 400 characters');
    assert.ok(sections.every((block: any) => block.text.text.length <= 3000));
    const lines: string[] = sections.flatMap((block: any) => block.text.text.split('\n'));
    assert.deepEqual(lines.map(line => line.split(':')[0]),
      ['企業名', 'HP', '事業内容', '役職', 'お名前', 'ニーズ']);
    assert.ok(lines.every(line => line.endsWith('…（続きは商談管理で確認）')));
    assert.ok(lines[2].length > 2400 && lines[5].length > 2400, 'business content and needs should retain their larger allowance');
    assert.equal(message.blocks.at(-2).elements[0].text, '商談ID: 123');
    assert.equal(message.blocks.at(-1).text.text, '<https://growth-park.onrender.com/leads|商談管理を開く>');
    assert.doesNotMatch(message.blocks[0].text.text, /[\r\n]/);

    const businessContent = '事'.repeat(2000);
    const needs = 'ニ'.repeat(1200);
    await notifyNewLeadRegistration({ ...lead, businessContent, needs });
    const intactSections = calls[1].blocks.filter((block: any) => block.type === 'section' && block.text.type === 'plain_text');
    assert.equal(intactSections.length, 2);
    const intactLines = intactSections.flatMap((block: any) => block.text.text.split('\n'));
    assert.equal(intactLines[2], `事業内容: ${businessContent}`);
    assert.equal(intactLines[5], `ニーズ: ${needs}`);

    await notifyNewLeadRegistration({
      ...lead, companyName: '', companyWebsite: null, businessContent: '\r\n\t',
      position: undefined, contactPerson: '  ', needs: null,
    });
    assert.equal(calls[2].blocks.length, 4, 'short messages should retain one body section');
    assert.deepEqual(calls[2].blocks[1].text.text.split('\n'),
      ['企業名', 'HP', '事業内容', '役職', 'お名前', 'ニーズ'].map(label => `${label}: 未設定`));
  } finally {
    transport.mock.restore();
    log.mock.restore();
  }
});

test('Slack failures resolve without exposing SDK payloads or credentials in logs', async () => {
  process.env.SLACK_LEAD_BOT_TOKEN = 'new-test-token';
  process.env.SLACK_LEAD_CHANNEL_ID = 'C_NEW';
  let failure: any = { code: 'slack_webapi_platform_error', data: { error: 'not_in_channel', token: 'SECRET', request: lead } };
  const transport = mock.method(WebClient.prototype, 'apiCall', async () => { throw failure; });
  const messages: unknown[][] = [];
  const errors = mock.method(console, 'error', (...args: unknown[]) => { messages.push(args); });
  try {
    await assert.doesNotReject(notifyNewLeadRegistration(lead));
    failure = { code: 'SECRET OR PRIVATE REQUEST', message: 'SECRET', data: { error: 'SECRET' } };
    await assert.doesNotReject(notifyNewLeadRegistration(lead));
    assert.deepEqual(messages, [
      ['Slack lead registration failed: not_in_channel'],
      ['Slack lead registration failed: notification_failed'],
    ]);
  } finally {
    transport.mock.restore();
    errors.mock.restore();
  }
});
