import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { boolToInt, intToBool, newId, nowIso } from './utils.js';

function userFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    telegramChatId: row.telegram_chat_id,
    telegramUsername: row.telegram_username || '',
    firstName: row.first_name || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function monitorFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    active: intToBool(row.active),
    tripType: row.trip_type,
    origin: row.origin,
    destination: row.destination,
    departureDate: row.departure_date,
    returnDate: row.return_date || '',
    maxPrice: Number(row.max_price),
    currency: row.currency,
    adults: Number(row.adults),
    cabinClass: row.cabin_class,
    checkIntervalMinutes: Number(row.check_interval_minutes),
    lastCheckedAt: row.last_checked_at || '',
    lastNotifiedFingerprint: row.last_notified_fingerprint || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class SqliteStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = null;
    this.data = {
      users: []
    };
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true });
    this.db = new Database(this.filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
    this.refreshCompatData();
  }

  async save() {
    this.refreshCompatData();
  }

  close() {
    this.db?.close();
  }

  refreshCompatData() {
    this.data.users = this.listUsers();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        telegram_chat_id TEXT NOT NULL UNIQUE,
        telegram_username TEXT NOT NULL DEFAULT '',
        first_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS monitors (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        active INTEGER NOT NULL DEFAULT 1,
        trip_type TEXT NOT NULL,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        departure_date TEXT NOT NULL,
        return_date TEXT NOT NULL DEFAULT '',
        max_price REAL NOT NULL,
        currency TEXT NOT NULL,
        adults INTEGER NOT NULL DEFAULT 1,
        cabin_class TEXT NOT NULL DEFAULT 'ECONOMY',
        check_interval_minutes INTEGER NOT NULL DEFAULT 30,
        last_checked_at TEXT NOT NULL DEFAULT '',
        last_notified_fingerprint TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        price REAL NOT NULL,
        currency TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        checked_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        price REAL NOT NULL,
        currency TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        telegram_message_id TEXT NOT NULL DEFAULT '',
        sent_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);
      CREATE INDEX IF NOT EXISTS idx_monitors_user_id ON monitors(user_id);
      CREATE INDEX IF NOT EXISTS idx_monitors_active ON monitors(active);
      CREATE INDEX IF NOT EXISTS idx_observations_monitor_id ON observations(monitor_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_monitor_id ON alerts(monitor_id);
    `);
  }

  listUsers() {
    return this.db.prepare('SELECT * FROM users').all().map(userFromRow);
  }

  async upsertUser(profile) {
    const telegramChatId = String(profile.telegramChatId);
    const existing = this.getUserByChatId(telegramChatId);
    const timestamp = nowIso();

    if (!existing) {
      const user = {
        id: newId('usr'),
        telegramChatId,
        telegramUsername: profile.telegramUsername || '',
        firstName: profile.firstName || '',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp
      };

      this.db.prepare(`
        INSERT INTO users (id, telegram_chat_id, telegram_username, first_name, status, created_at, updated_at)
        VALUES (@id, @telegramChatId, @telegramUsername, @firstName, @status, @createdAt, @updatedAt)
      `).run(user);
      this.refreshCompatData();
      return user;
    }

    this.db.prepare(`
      UPDATE users
      SET telegram_username = @telegramUsername,
          first_name = @firstName,
          updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id: existing.id,
      telegramUsername: profile.telegramUsername || existing.telegramUsername,
      firstName: profile.firstName || existing.firstName,
      updatedAt: timestamp
    });

    this.refreshCompatData();
    return this.getUserByChatId(telegramChatId);
  }

  getUserByChatId(chatId) {
    return userFromRow(this.db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(String(chatId)));
  }

  async createMonitor(input) {
    const timestamp = nowIso();
    const monitor = {
      id: newId('mon'),
      userId: input.userId,
      active: true,
      tripType: input.returnDate ? 'round' : 'oneway',
      origin: input.origin.toUpperCase(),
      destination: input.destination.toUpperCase(),
      departureDate: input.departureDate,
      returnDate: input.returnDate || '',
      maxPrice: Number(input.maxPrice),
      currency: input.currency,
      adults: Number(input.adults || 1),
      cabinClass: input.cabinClass || 'ECONOMY',
      checkIntervalMinutes: Number(input.checkIntervalMinutes || 30),
      lastCheckedAt: '',
      lastNotifiedFingerprint: '',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.db.prepare(`
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
    `).run({ ...monitor, active: boolToInt(monitor.active) });

    return monitor;
  }

  listUserMonitors(userId) {
    return this.db.prepare('SELECT * FROM monitors WHERE user_id = ? ORDER BY created_at ASC').all(userId).map(monitorFromRow);
  }

  listActiveMonitors() {
    return this.db.prepare('SELECT * FROM monitors WHERE active = 1 ORDER BY created_at ASC').all().map(monitorFromRow);
  }

  getMonitor(id) {
    return monitorFromRow(this.db.prepare('SELECT * FROM monitors WHERE id = ?').get(id));
  }

  async setMonitorActive(userId, monitorId, active) {
    const result = this.db.prepare(`
      UPDATE monitors
      SET active = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(boolToInt(active), nowIso(), monitorId, userId);

    if (!result.changes) return null;
    return this.getMonitor(monitorId);
  }

  async removeMonitor(userId, monitorId) {
    const result = this.db.prepare('DELETE FROM monitors WHERE id = ? AND user_id = ?').run(monitorId, userId);
    return result.changes > 0;
  }

  async deleteUserData(userId) {
    const monitorIds = this.db.prepare('SELECT id FROM monitors WHERE user_id = ?').all(userId).map((row) => row.id);
    const deleted = {
      users: this.db.prepare('SELECT COUNT(*) AS count FROM users WHERE id = ?').get(userId).count,
      monitors: monitorIds.length,
      observations: monitorIds.length
        ? this.db.prepare(`SELECT COUNT(*) AS count FROM observations WHERE monitor_id IN (${monitorIds.map(() => '?').join(',')})`).get(...monitorIds).count
        : 0,
      alerts: this.db.prepare('SELECT COUNT(*) AS count FROM alerts WHERE user_id = ?').get(userId).count
    };

    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    this.refreshCompatData();
    return deleted;
  }

  async recordObservation(monitorId, offer) {
    const checkedAt = nowIso();
    const observation = {
      id: newId('obs'),
      monitorId,
      provider: offer.provider,
      price: Number(offer.price),
      currency: offer.currency,
      fingerprint: offer.fingerprint,
      rawJson: JSON.stringify(offer),
      checkedAt
    };

    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO observations (id, monitor_id, provider, price, currency, fingerprint, raw_json, checked_at)
        VALUES (@id, @monitorId, @provider, @price, @currency, @fingerprint, @rawJson, @checkedAt)
      `).run(observation);
      this.db.prepare('UPDATE monitors SET last_checked_at = ?, updated_at = ? WHERE id = ?').run(checkedAt, checkedAt, monitorId);
    });
    transaction();

    return {
      id: observation.id,
      monitorId,
      provider: observation.provider,
      price: observation.price,
      currency: observation.currency,
      fingerprint: observation.fingerprint,
      raw: offer,
      checkedAt
    };
  }

  async recordAlert(monitor, offer, telegramMessageId) {
    const sentAt = nowIso();
    const alert = {
      id: newId('alt'),
      monitorId: monitor.id,
      userId: monitor.userId,
      provider: offer.provider,
      price: Number(offer.price),
      currency: offer.currency,
      fingerprint: offer.fingerprint,
      telegramMessageId: telegramMessageId ? String(telegramMessageId) : '',
      sentAt
    };

    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO alerts (id, monitor_id, user_id, provider, price, currency, fingerprint, telegram_message_id, sent_at)
        VALUES (@id, @monitorId, @userId, @provider, @price, @currency, @fingerprint, @telegramMessageId, @sentAt)
      `).run(alert);
      this.db.prepare('UPDATE monitors SET last_notified_fingerprint = ?, updated_at = ? WHERE id = ?').run(offer.fingerprint, sentAt, monitor.id);
    });
    transaction();

    monitor.lastNotifiedFingerprint = offer.fingerprint;
    monitor.updatedAt = sentAt;
    return alert;
  }
}
