import { config } from '../src/config.js';
import { PostgresStore } from '../src/storage/postgres-store.js';
import { SqliteStore } from '../src/storage/sqlite-store.js';

if (!config.databaseUrl.startsWith('postgres')) {
  throw new Error('Set DATABASE_URL to your PostgreSQL connection string before running this migration.');
}

const sqlitePath = process.env.SQLITE_DATABASE_URL || './data/monitor-aereo.sqlite';
const sqliteStore = new SqliteStore(sqlitePath);
await sqliteStore.load();

const postgresStore = new PostgresStore(config.databaseUrl);
await postgresStore.load();

let users = 0;
let monitors = 0;
let observations = 0;
let alerts = 0;

for (const user of sqliteStore.listUsers()) {
  const existing = await postgresStore.getUserByChatId(user.telegramChatId);
  if (!existing) {
    await postgresStore.pool.query(`
      INSERT INTO users (id, telegram_chat_id, telegram_username, first_name, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      user.id,
      user.telegramChatId,
      user.telegramUsername,
      user.firstName,
      user.status,
      user.createdAt,
      user.updatedAt
    ]);
    users += 1;
  }
}

const sqliteMonitors = sqliteStore.db.prepare('SELECT * FROM monitors ORDER BY created_at ASC').all();
for (const monitor of sqliteMonitors) {
  const existing = await postgresStore.getMonitor(monitor.id);
  if (!existing) {
    await postgresStore.pool.query(`
      INSERT INTO monitors (
        id, user_id, active, trip_type, origin, destination, departure_date, return_date,
        max_price, currency, adults, cabin_class, check_interval_minutes,
        last_checked_at, last_notified_fingerprint, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `, [
      monitor.id,
      monitor.user_id,
      monitor.active,
      monitor.trip_type,
      monitor.origin,
      monitor.destination,
      monitor.departure_date,
      monitor.return_date,
      monitor.max_price,
      monitor.currency,
      monitor.adults,
      monitor.cabin_class,
      monitor.check_interval_minutes,
      monitor.last_checked_at,
      monitor.last_notified_fingerprint,
      monitor.created_at,
      monitor.updated_at
    ]);
    monitors += 1;
  }
}

const sqliteObservations = sqliteStore.db.prepare('SELECT * FROM observations ORDER BY checked_at ASC').all();
for (const observation of sqliteObservations) {
  const exists = await postgresStore.pool.query('SELECT id FROM observations WHERE id = $1', [observation.id]);
  if (!exists.rows[0]) {
    await postgresStore.pool.query(`
      INSERT INTO observations (id, monitor_id, provider, price, currency, fingerprint, raw_json, checked_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
    `, [
      observation.id,
      observation.monitor_id,
      observation.provider,
      observation.price,
      observation.currency,
      observation.fingerprint,
      observation.raw_json,
      observation.checked_at
    ]);
    observations += 1;
  }
}

const sqliteAlerts = sqliteStore.db.prepare('SELECT * FROM alerts ORDER BY sent_at ASC').all();
for (const alert of sqliteAlerts) {
  const exists = await postgresStore.pool.query('SELECT id FROM alerts WHERE id = $1', [alert.id]);
  if (!exists.rows[0]) {
    await postgresStore.pool.query(`
      INSERT INTO alerts (id, monitor_id, user_id, provider, price, currency, fingerprint, telegram_message_id, sent_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      alert.id,
      alert.monitor_id,
      alert.user_id,
      alert.provider,
      alert.price,
      alert.currency,
      alert.fingerprint,
      alert.telegram_message_id,
      alert.sent_at
    ]);
    alerts += 1;
  }
}

sqliteStore.close();
await postgresStore.close();

console.log('Migration complete.');
console.log(JSON.stringify({ users, monitors, observations, alerts }, null, 2));
