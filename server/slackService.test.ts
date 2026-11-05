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
  connectorName: '紹介者 <@U123>',
  assignedPerson: '浜野',
  supporterCompanyName: '支援先 <https://example.com|リンク>',
  // Extra database fields must never reach Slack.
  contactPerson: 'PRIVATE CONTACT',
  contactInfo: 'private@example.com',
  meetingFee: 987654,
  needs: 'PRIVATE NEEDS',
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
    assert.deepEqual(message.blocks[1].fields.map((field: any) => field.type), Array(4).fill('plain_text'));
    assert.ok(message.blocks[1].fields.some((field: any) => field.text.includes('<!channel>')));
    assert.equal(message.blocks[2].elements[0].text, '商談ID: 123');
    const markdown = message.blocks.filter((block: any) => block.text?.type === 'mrkdwn');
    assert.deepEqual(markdown, [{ type: 'section', text: { type: 'mrkdwn', text: '<https://growth-park.onrender.com/leads|商談管理を開く>' } }]);
    assert.doesNotMatch(JSON.stringify(message), /PRIVATE|private@example|987654/);

    await notifyNewLeadRegistration({ ...lead, companyName: '長'.repeat(10000), assignedPerson: '' });
    assert.ok(calls[1].args.blocks[1].fields.every((field: any) => field.text.length <= 2000));
    assert.equal(calls[1].args.blocks[1].fields[2].text, 'ZETTAICHI担当者: 未設定');

    await notifyNewConnectorRegistration({ name: '登録者', email: 'legacy@example.com' });
    await notifyMeetingReport({ leadId: 123, companyName: '企業', contactPerson: '担当者', connectorName: '紹介者' });
    assert.deepEqual(calls.slice(2).map(call => [call.token, call.args.channel]), [
      ['legacy-test-token', 'C_LEGACY'], ['legacy-test-token', 'C_LEGACY'],
    ]);
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_CHANNEL_ID;
    await notifyNewConnectorRegistration({ name: '登録者', email: 'legacy@example.com' });
    await notifyMeetingReport({ leadId: 123, companyName: '企業', contactPerson: '担当者', connectorName: '紹介者' });
    assert.equal(calls.length, 4, 'legacy events must not use the new lead-only destination');
  } finally {
    transport.mock.restore();
    warn.mock.restore();
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
