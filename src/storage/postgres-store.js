import pg from 'pg';
import { boolToInt, intToBool, newId, nowIso } from './utils.js';

const { Pool } = pg;

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

export class PostgresStore {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.pool = null;
    this.data = { users: [] };
  }

  async load() {
    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: this.connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
    });
    await this.migrate();
    await this.refreshCompatData();
  }

  async save() {
    await this.refreshCompatData();
  }

  async close() {
    await this.pool?.end();
  }

  async refreshCompatData() {
    this.data.users = await this.listUsers();
  }

  async migrate() {
    await this.pool.query(`
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
        max_price NUMERIC NOT NULL,
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
        price NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        checked_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        price NUMERIC NOT NULL,
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

  async listUsers() {
    const result = await this.pool.query('SELECT * FROM users');
    return result.rows.map(userFromRow);
  }

  async upsertUser(profile) {
    const telegramChatId = String(profile.telegramChatId);
    const timestamp = nowIso();
    const id = newId('usr');

    const result = await this.pool.query(`
      INSERT INTO users (id, telegram_chat_id, telegram_username, first_name, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'active', $5, $5)
      ON CONFLICT (telegram_chat_id) DO UPDATE
      SET telegram_username = EXCLUDED.telegram_username,
          first_name = EXCLUDED.first_name,
          updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      id,
      telegramChatId,
      profile.telegramUsername || '',
      profile.firstName || '',
      timestamp
    ]);

    await this.refreshCompatData();
    return userFromRow(result.rows[0]);
  }

  async getUserByChatId(chatId) {
    const result = await this.pool.query('SELECT * FROM users WHERE telegram_chat_id = $1', [String(chatId)]);
    return userFromRow(result.rows[0]);
  }

  async getUserById(userId) {
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    return userFromRow(result.rows[0]);
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

    await this.pool.query(`
      INSERT INTO monitors (
        id, user_id, active, trip_type, origin, destination, departure_date, return_date,
        max_price, currency, adults, cabin_class, check_interval_minutes,
        last_checked_at, last_notified_fingerprint, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `, [
      monitor.id,
      monitor.userId,
      boolToInt(monitor.active),
      monitor.tripType,
      monitor.origin,
      monitor.destination,
      monitor.departureDate,
      monitor.returnDate,
      monitor.maxPrice,
      monitor.currency,
      monitor.adults,
      monitor.cabinClass,
      monitor.checkIntervalMinutes,
      monitor.lastCheckedAt,
      monitor.lastNotifiedFingerprint,
      monitor.createdAt,
      monitor.updatedAt
    ]);

    return monitor;
  }

  async listUserMonitors(userId) {
    const result = await this.pool.query('SELECT * FROM monitors WHERE user_id = $1 ORDER BY created_at ASC', [userId]);
    return result.rows.map(monitorFromRow);
  }

  async listActiveMonitors() {
    const result = await this.pool.query('SELECT * FROM monitors WHERE active = 1 ORDER BY created_at ASC');
    return result.rows.map(monitorFromRow);
  }

  async getMonitor(id) {
    const result = await this.pool.query('SELECT * FROM monitors WHERE id = $1', [id]);
    return monitorFromRow(result.rows[0]);
  }

  async setMonitorActive(userId, monitorId, active) {
    const result = await this.pool.query(`
      UPDATE monitors
      SET active = $1, updated_at = $2
      WHERE id = $3 AND user_id = $4
      RETURNING *
    `, [boolToInt(active), nowIso(), monitorId, userId]);

    return monitorFromRow(result.rows[0]);
  }

  async removeMonitor(userId, monitorId) {
    const result = await this.pool.query('DELETE FROM monitors WHERE id = $1 AND user_id = $2', [monitorId, userId]);
    return result.rowCount > 0;
  }

  async deleteUserData(userId) {
    const monitors = await this.pool.query('SELECT id FROM monitors WHERE user_id = $1', [userId]);
    const monitorIds = monitors.rows.map((row) => row.id);
    const deleted = {
      users: Number((await this.pool.query('SELECT COUNT(*) AS count FROM users WHERE id = $1', [userId])).rows[0].count),
      monitors: monitorIds.length,
      observations: monitorIds.length
        ? Number((await this.pool.query('SELECT COUNT(*) AS count FROM observations WHERE monitor_id = ANY($1)', [monitorIds])).rows[0].count)
        : 0,
      alerts: Number((await this.pool.query('SELECT COUNT(*) AS count FROM alerts WHERE user_id = $1', [userId])).rows[0].count)
    };

    await this.pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await this.refreshCompatData();
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
      raw: offer,
      checkedAt
    };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO observations (id, monitor_id, provider, price, currency, fingerprint, raw_json, checked_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      `, [
        observation.id,
        observation.monitorId,
        observation.provider,
        observation.price,
        observation.currency,
        observation.fingerprint,
        JSON.stringify(observation.raw),
        observation.checkedAt
      ]);
      await client.query('UPDATE monitors SET last_checked_at = $1, updated_at = $1 WHERE id = $2', [checkedAt, monitorId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return observation;
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

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO alerts (id, monitor_id, user_id, provider, price, currency, fingerprint, telegram_message_id, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        alert.id,
        alert.monitorId,
        alert.userId,
        alert.provider,
        alert.price,
        alert.currency,
        alert.fingerprint,
        alert.telegramMessageId,
        alert.sentAt
      ]);
      await client.query('UPDATE monitors SET last_notified_fingerprint = $1, updated_at = $2 WHERE id = $3', [offer.fingerprint, sentAt, monitor.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    monitor.lastNotifiedFingerprint = offer.fingerprint;
    monitor.updatedAt = sentAt;
    return alert;
  }
}
