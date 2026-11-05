import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { WebClient } from '@slack/web-api';

// No real database or Slack credentials are used; external calls are mocked.
process.env.NEON_DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'local-lead-notification-test';
process.env.SLACK_LEAD_BOT_TOKEN = 'new-test-token';
process.env.SLACK_LEAD_CHANNEL_ID = 'C_NEW';
process.env.SLACK_BOT_TOKEN = 'legacy-test-token';
process.env.SLACK_CHANNEL_ID = 'C_LEGACY';
delete process.env.FRICTIO_SIGNING_SECRET;
const { registerRoutes } = await import('./routes');
const { storage } = await import('./storage');

test('all lead creation routes notify once after save and retain saved data if Slack fails', async () => {
  const accounts: any[] = [
    { id: 1, role: 'AddBox', name: '宮本', email: 'admin@zettaichi.co.jp' },
    { id: 2, role: 'Connector', name: '紹介者', email: 'connector@example.com' },
  ];
  const saved: any[] = [];
  const sent: any[] = [];
  let failStorage = false;
  let failSlack = false;
  const mocks = [
    mock.method(console, 'log', () => {}),
    mock.method(console, 'error', () => {}),
    mock.method(storage, 'getUser', async (id: number) => accounts.find(user => user.id === id)),
    mock.method(storage, 'getUsers', async () => accounts),
    mock.method(storage, 'getSupporters', async () => [{ id: 7, companyName: '支援先', meetingFee: 50000 }]),
    mock.method(storage, 'getSupporter', async () => ({ id: 7, companyName: '支援先' })),
    mock.method(storage, 'createLead', async (data: any) => {
      if (failStorage) throw new Error('simulated storage failure');
      const lead = { ...data, id: 100 + saved.length };
      saved.push(lead);
      return lead;
    }),
    mock.method(WebClient.prototype, 'apiCall', async function (this: WebClient, method: string, args: any) {
      // The database record must already exist when the message is sent.
      sent.push({ token: this.token, method, args, savedCount: saved.length });
      if (failSlack) throw { code: 'slack_webapi_request_error' };
      return { ok: true, ts: '123.456' };
    }),
  ];
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = (path: string, actor: number | undefined, body: any) => fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(actor ? { Authorization: `Bearer ${jwt.sign({ userId: actor }, process.env.JWT_SECRET!)}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = {
    connectorId: 2, supporterId: 7, companyName: '企業名', businessContent: '非公開の事業内容',
    contactPerson: '非公開の担当者', contactInfo: 'private@example.com', needs: '非公開のニーズ',
    assignedPerson: '浜野', source: 'そのほか', meetingFee: 50000,
  };
  try {
    assert.equal((await request('/api/leads', undefined, payload)).status, 401);
    assert.equal((await request('/api/connectors/1/leads', 2, payload)).status, 403);
    assert.equal((await request('/api/connectors/2/leads', 2, {})).status, 400);
    assert.equal(saved.length, 0);
    assert.equal(sent.length, 0);

    assert.equal((await request('/api/leads', 1, payload)).status, 200);
    assert.equal((await request('/api/connectors/2/leads', 2, payload)).status, 200);
    assert.equal(saved.length, 2);
    assert.equal(sent.length, 2);

    const webhook = {
      event: 'meeting.completed.beta',
      data: { playbook: { 'トスアップ判定': '○', '企業名': '連携企業', '支援先名': '支援先', '担当者名': '浜野' } },
    };
    assert.equal((await request('/api/webhooks/frictio', undefined, { ...webhook, event: 'other' })).status, 200);
    assert.equal(sent.length, 2);
    assert.equal((await request('/api/webhooks/frictio', undefined, webhook)).status, 200);
    assert.equal(saved.length, 3);
    assert.equal(sent.length, 3);
    assert.ok(sent.every(call => call.token === 'new-test-token' && call.args.channel === 'C_NEW'));
    assert.doesNotMatch(JSON.stringify(sent), /非公開|private@example|50000|C_LEGACY/);

    failStorage = true;
    assert.equal((await request('/api/connectors/2/leads', 2, payload)).status, 500);
    assert.equal(sent.length, 3);
    failStorage = false;
    failSlack = true;
    assert.equal((await request('/api/connectors/2/leads', 2, payload)).status, 200);
    assert.equal(saved.length, 4);
    assert.equal(sent.length, 4);
    assert.deepEqual(sent.map(call => call.savedCount), [1, 2, 3, 4]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const item of mocks) item.mock.restore();
  }
});
