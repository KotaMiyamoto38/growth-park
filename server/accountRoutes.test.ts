import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';

// Deliberately unusable external-service credentials: all storage is replaced below.
process.env.NEON_DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'local-account-route-test';
process.env.SLACK_BOT_TOKEN = 'test';
process.env.SLACK_CHANNEL_ID = 'test';
const { registerRoutes } = await import('./routes');
const { storage } = await import('./storage');
const { AccountDeletionConflictError } = await import('./accountDeletion');

test('account routes enforce admin permissions and preserve account data on promotion', async () => {
  const originalGet = storage.getUser;
  const originalUpdate = storage.updateUser;
  const originalDelete = storage.deleteUser;
  const accounts = new Map<number, any>([
    [1, { id: 1, role: 'AddBox', email: 'admin@zettaichi.co.jp' }],
    [2, { id: 2, role: 'Connector', email: 'h.akutsu@zettaichi.co.jp', name: '阿久津', password: 'unchanged-hash', connectorCompanyId: 7 }],
    [3, { id: 3, role: 'Connector', email: 'external@example.com' }],
    [4, { id: 4, role: 'Client', email: 'client@zettaichi.co.jp' }],
  ]);
  const updates: any[] = [];
  const deletions: number[] = [];
  storage.getUser = async id => accounts.get(id);
  storage.updateUser = async (id, patch) => {
    updates.push({ id, patch });
    const updated = { ...accounts.get(id), ...patch };
    accounts.set(id, updated);
    return updated;
  };
  storage.deleteUser = async id => {
    deletions.push(id);
    if (id === 2) throw new AccountDeletionConflictError();
    accounts.delete(id);
  };
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = (path: string, actor?: number, body: any = { confirm: true }, method = 'POST') => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${jwt.sign({ userId: actor }, process.env.JWT_SECRET!)}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  try {
    const target = '/api/admin/connectors/2/promote';
    assert.equal((await request(target)).status, 401);
    assert.equal((await request(target, 2)).status, 403);
    assert.equal((await request(target, 3)).status, 403);
    assert.equal((await request(target, 1, {})).status, 400);
    assert.equal((await request('/api/admin/connectors/2x/promote', 1)).status, 400);
    assert.equal((await request('/api/admin/connectors/999/promote', 1)).status, 404);
    assert.equal((await request('/api/admin/connectors/3/promote', 1)).status, 403);
    assert.equal((await request('/api/admin/connectors/4/promote', 1)).status, 409);
    assert.equal(updates.length, 0);
    const promoted = await request(target, 1);
    assert.equal(promoted.status, 200);
    assert.deepEqual(await promoted.json(), { id: 2, name: '阿久津', email: 'h.akutsu@zettaichi.co.jp', role: 'AddBox' });
    assert.deepEqual(updates, [{ id: 2, patch: { role: 'AddBox' } }]);
    assert.equal(accounts.get(2).password, 'unchanged-hash');
    assert.equal(accounts.get(2).connectorCompanyId, 7);
    assert.equal((await request(target, 1)).status, 200);
    assert.equal(updates.length, 1);
    // Deletion acts on the authenticated account and returns an actionable conflict.
    const blocked = await request('/api/auth/account', 2, undefined, 'DELETE');
    assert.equal(blocked.status, 409);
    assert.match((await blocked.json()).message, /商談|契約/);
    assert.deepEqual(deletions, [2]);
    assert.ok(accounts.has(2));
    assert.equal((await request('/api/auth/account', 3, undefined, 'DELETE')).status, 200);
    assert.equal((await request('/api/auth/account', 3, undefined, 'DELETE')).status, 401);
  } finally {
    storage.getUser = originalGet;
    storage.updateUser = originalUpdate;
    storage.deleteUser = originalDelete;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
