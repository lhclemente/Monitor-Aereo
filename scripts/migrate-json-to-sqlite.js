import { existsSync } from 'node:fs';
import { config } from '../src/config.js';
import { JsonStore } from '../src/storage/json-store.js';
import { SqliteStore } from '../src/storage/sqlite-store.js';

if (!existsSync(config.dataFile)) {
  console.log(`JSON file not found: ${config.dataFile}`);
  process.exit(0);
}

const jsonStore = new JsonStore(config.dataFile);
await jsonStore.load();

const sqliteStore = new SqliteStore(config.databaseUrl);
await sqliteStore.load();

let users = 0;
let monitors = 0;
let observations = 0;
let alerts = 0;

for (const user of jsonStore.data.users) {
  const existing = sqliteStore.getUserByChatId(user.telegramChatId);
  if (!existing) {
    sqliteStore.db.prepare(`
      INSERT INTO users (id, telegram_chat_id, telegram_username, first_name, status, created_at, updated_at)
      VALUES (@id, @telegramChatId, @telegramUsername, @firstName, @status, @createdAt, @updatedAt)
    `).run(user);
    users += 1;
  }
}

for (const monitor of jsonStore.data.monitors) {
  if (!sqliteStore.getMonitor(monitor.id)) {
    sqliteStore.db.prepare(`
      INSERT INTO monitors (
        id, user_id, active, trip_type, origin, destination, departure_date, return_date,
        max_price, currency, adults, cabin_class, check_interval_minutes,
        last_checked_at, last_notified_fingerprint, created_at, updated_at
      )
      VALUES (
        @id, @userId, @active, @tripType, @origin, @destination, @departureDate, @returnDate,
        @maxPrice, @currency, @adults, @cabinClass, @checkIntervalMinutes,
        @lastCheckedAt, @lastNotifiedFingerprint, @createdAt, @updatedAt
      )
    `).run({
      ...monitor,
      active: monitor.active ? 1 : 0,
      tripType: monitor.tripType || (monitor.returnDate ? 'round' : 'oneway'),
      lastCheckedAt: monitor.lastCheckedAt || '',
      lastNotifiedFingerprint: monitor.lastNotifiedFingerprint || ''
    });
    monitors += 1;
  }
}

for (const observation of jsonStore.data.observations) {
  const exists = sqliteStore.db.prepare('SELECT id FROM observations WHERE id = ?').get(observation.id);
  if (!exists) {
    sqliteStore.db.prepare(`
      INSERT INTO observations (id, monitor_id, provider, price, currency, fingerprint, raw_json, checked_at)
      VALUES (@id, @monitorId, @provider, @price, @currency, @fingerprint, @rawJson, @checkedAt)
    `).run({
      id: observation.id,
      monitorId: observation.monitorId,
      provider: observation.provider,
      price: observation.price,
      currency: observation.currency,
      fingerprint: observation.fingerprint,
      rawJson: JSON.stringify(observation.raw || {}),
      checkedAt: observation.checkedAt
    });
    observations += 1;
  }
}

for (const alert of jsonStore.data.alerts) {
  const exists = sqliteStore.db.prepare('SELECT id FROM alerts WHERE id = ?').get(alert.id);
  if (!exists) {
    sqliteStore.db.prepare(`
      INSERT INTO alerts (id, monitor_id, user_id, provider, price, currency, fingerprint, telegram_message_id, sent_at)
      VALUES (@id, @monitorId, @userId, @provider, @price, @currency, @fingerprint, @telegramMessageId, @sentAt)
    `).run({
      id: alert.id,
      monitorId: alert.monitorId,
      userId: alert.userId,
      provider: alert.provider,
      price: alert.price,
      currency: alert.currency,
      fingerprint: alert.fingerprint,
      telegramMessageId: alert.telegramMessageId || '',
      sentAt: alert.sentAt
    });
    alerts += 1;
  }
}

sqliteStore.close();

console.log('Migration complete.');
console.log(JSON.stringify({ users, monitors, observations, alerts }, null, 2));
