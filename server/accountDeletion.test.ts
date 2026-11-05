// Isolated PostgreSQL integration tests; never loads server/db or production credentials.
// Test-only setup (no package.json/package-lock.json changes):
// npm install --no-save --package-lock=false @electric-sql/pglite@0.5.15
// node --import tsx --test server/accountDeletion.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { deleteAccount, AccountDeletionConflictError } from './accountDeletion';

async function setup() {
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE users (id integer PRIMARY KEY, email text NOT NULL UNIQUE);
    CREATE TABLE connector_companies (id integer PRIMARY KEY, representative_id integer, updated_at timestamp);
    CREATE TABLE leads (id integer PRIMARY KEY, connector_id integer NOT NULL REFERENCES users(id));
    CREATE TABLE meeting_reports (id integer PRIMARY KEY, connector_id integer NOT NULL REFERENCES users(id));
    CREATE TABLE contracts (id integer PRIMARY KEY, addbox_member_id integer NOT NULL);
    CREATE TABLE notifications (id integer PRIMARY KEY, connector_id integer REFERENCES users(id), message text);
    CREATE TABLE password_reset_tokens (id integer PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id));
    INSERT INTO users VALUES (1, 'h.akutsu@zettaichi.co.jp'), (2, 'other@example.com');
    INSERT INTO connector_companies VALUES (11, 1, '2026-01-01'), (12, 2, '2026-01-01');
    INSERT INTO notifications VALUES (21, 1, 'Keep this business notification'), (22, 2, 'Other user');
    INSERT INTO password_reset_tokens VALUES (31, 1), (32, 2);
  `);
  return { client, db: drizzle(client) };
}
const rows = async (client: PGlite, table: string) => (await client.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
const snapshot = async (client: PGlite) => Object.fromEntries(await Promise.all(
  ['users','connector_companies','leads','meeting_reports','contracts','notifications','password_reset_tokens'].map(async table => [table, await rows(client, table)]),
));

test('deletes login and own reset tokens, preserves companies, notifications and other users, frees email', async () => {
  const { client, db } = await setup();
  try {
    const companiesBefore = await rows(client, 'connector_companies');
    await deleteAccount(db, 1);
    assert.deepEqual(await rows(client, 'users'), [{id: 2, email: 'other@example.com'}]);
    assert.deepEqual(await rows(client, 'password_reset_tokens'), [{id: 32, user_id: 2}]);
    assert.deepEqual(await rows(client, 'notifications'), [
      {id: 21, connector_id: null, message: 'Keep this business notification'},
      {id: 22, connector_id: 2, message: 'Other user'},
    ]);
    const companies: any[] = await rows(client, 'connector_companies');
    assert.equal(companies.length, 2);
    assert.equal(companies[0].representative_id, null);
    assert.equal(companies[1].representative_id, 2);
    assert.deepEqual(companies[1], companiesBefore[1]);
    await client.exec("INSERT INTO users VALUES (3, 'h.akutsu@zettaichi.co.jp')");
    assert.equal((await rows(client, 'users')).length, 2);
  } finally { await client.close(); }
});

for (const table of ['leads', 'meeting_reports', 'contracts']) {
  test(`${table} blocks account deletion and leaves every row unchanged`, async () => {
    const { client, db } = await setup();
    try {
      await client.exec(`INSERT INTO ${table} VALUES (99, 1)`);
      const before = await snapshot(client);
      await assert.rejects(() => deleteAccount(db, 1), AccountDeletionConflictError);
      assert.deepEqual(await snapshot(client), before);
    } finally { await client.close(); }
  });
}

test('unanticipated foreign key failure rolls back reset-token deletion and detached references', async () => {
  const { client, db } = await setup();
  try {
    await client.exec('CREATE TABLE unknown_reference (user_id integer REFERENCES users(id)); INSERT INTO unknown_reference VALUES (1)');
    const before = await snapshot(client);
    await assert.rejects(() => deleteAccount(db, 1));
    assert.deepEqual(await snapshot(client), before);
  } finally { await client.close(); }
});

test('missing user is idempotent and cannot affect another account', async () => {
  const { client, db } = await setup();
  try {
    const before = await snapshot(client);
    await deleteAccount(db, 999);
    assert.deepEqual(await snapshot(client), before);
  } finally { await client.close(); }
});
