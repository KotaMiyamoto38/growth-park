import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { WebClient } from '@slack/web-api';

process.env.NEON_DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'local-slack-test-route';
process.env.SLACK_BOT_TOKEN = 'legacy-test-token';
process.env.SLACK_CHANNEL_ID = 'C_LEGACY';
const { registerRoutes } = await import('./routes');
const { storage } = await import('./storage');

test('only administrators can test the configured lead channel without creating any data', async () => {
  const sent: any[] = [];
  const logs: unknown[][] = [];
  let failSlack = false;
  const mocks = [
    mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); }),
    mock.method(storage, 'getUser', async (id: number) => ({ id, role: id === 1 ? 'AddBox' : 'Connector' })),
    mock.method(storage, 'createLead', async () => { throw new Error('test notification must never create a lead'); }),
    mock.method(WebClient.prototype, 'apiCall', async function (this: WebClient, method: string, args: any) {
      sent.push({ token: this.token, method, args });
      if (failSlack) throw { code: 'slack_webapi_platform_error', data: { error: 'not_in_channel', token: 'SECRET' } };
      return { ok: true, ts: '123.456' };
    }),
  ];
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = (actor?: number) => fetch(base + '/api/admin/slack/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(actor ? { Authorization: `Bearer ${jwt.sign({ userId: actor }, process.env.JWT_SECRET!)}` } : {}),
    },
    // Caller data must never change destination or message contents.
    body: JSON.stringify({ channel: 'C_ATTACKER', text: '<!channel> UNTRUSTED', companyName: 'UNTRUSTED' }),
  });
  try {
    delete process.env.SLACK_LEAD_BOT_TOKEN;
    delete process.env.SLACK_LEAD_CHANNEL_ID;
    assert.equal((await request()).status, 401);
    assert.equal((await request(2)).status, 403);
    assert.equal((await request(1)).status, 503);
    process.env.SLACK_LEAD_BOT_TOKEN = 'new-test-token';
    assert.equal((await request(1)).status, 503);
    assert.equal(sent.length, 0);

    process.env.SLACK_LEAD_CHANNEL_ID = 'C_NEW';
    const success = await request(1);
    assert.equal(success.status, 200);
    assert.match((await success.json()).message, /送信しました/);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].token, 'new-test-token');
    assert.equal(sent[0].method, 'chat.postMessage');
    assert.equal(sent[0].args.channel, 'C_NEW');
    assert.equal(sent[0].args.parse, 'none');
    assert.equal(sent[0].args.text, '【接続テスト】Growth ParkからのSlack通知です。新規商談は登録していません。');
    assert.equal(sent[0].args.blocks[0].text.type, 'plain_text');
    assert.doesNotMatch(JSON.stringify(sent[0]), /C_ATTACKER|UNTRUSTED|<!channel>/);

    failSlack = true;
    const failed = await request(1);
    assert.equal(failed.status, 502);
    const failureText = JSON.stringify(await failed.json());
    assert.match(failureText, /テスト通知に失敗/);
    assert.doesNotMatch(failureText, /SECRET|not_in_channel|new-test-token/);
    assert.deepEqual(logs, []);
    assert.equal(mocks[2].mock.callCount(), 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const item of mocks) item.mock.restore();
  }
});
