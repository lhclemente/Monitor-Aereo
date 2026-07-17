import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { newId, nowIso } from './utils.js';

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {
      users: [],
      monitors: [],
      observations: [],
      alerts: []
    };
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.data = JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.save();
    }
  }

  async save() {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  async upsertUser(profile) {
    const telegramChatId = String(profile.telegramChatId);
    let user = this.data.users.find((item) => item.telegramChatId === telegramChatId);
    if (!user) {
      user = {
        id: newId('usr'),
        telegramChatId,
        telegramUsername: profile.telegramUsername || '',
        firstName: profile.firstName || '',
        status: 'active',
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      this.data.users.push(user);
    } else {
      user.telegramUsername = profile.telegramUsername || user.telegramUsername;
      user.firstName = profile.firstName || user.firstName;
      user.updatedAt = nowIso();
    }
    await this.save();
    return user;
  }

  getUserByChatId(chatId) {
    return this.data.users.find((user) => user.telegramChatId === String(chatId));
  }

  getUserById(userId) {
    return this.data.users.find((user) => user.id === userId);
  }

  async createMonitor(input) {
    const monitor = {
      id: newId('mon'),
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
      createdAt: nowIso(),
      updatedAt: nowIso(),
      userId: input.userId
    };
    this.data.monitors.push(monitor);
    await this.save();
    return monitor;
  }

  listUserMonitors(userId) {
    return this.data.monitors
      .filter((monitor) => monitor.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  listActiveMonitors() {
    return this.data.monitors.filter((monitor) => monitor.active);
  }

  getMonitor(id) {
    return this.data.monitors.find((monitor) => monitor.id === id);
  }

  async setMonitorActive(userId, monitorId, active) {
    const monitor = this.data.monitors.find((item) => item.id === monitorId && item.userId === userId);
    if (!monitor) return null;
    monitor.active = active;
    monitor.updatedAt = nowIso();
    await this.save();
    return monitor;
  }

  async removeMonitor(userId, monitorId) {
    const before = this.data.monitors.length;
    this.data.monitors = this.data.monitors.filter((item) => !(item.id === monitorId && item.userId === userId));
    await this.save();
    return this.data.monitors.length !== before;
  }

  async deleteUserData(userId) {
    const monitorIds = new Set(
      this.data.monitors
        .filter((monitor) => monitor.userId === userId)
        .map((monitor) => monitor.id)
    );

    const deleted = {
      users: this.data.users.filter((user) => user.id === userId).length,
      monitors: monitorIds.size,
      observations: this.data.observations.filter((observation) => monitorIds.has(observation.monitorId)).length,
      alerts: this.data.alerts.filter((alert) => alert.userId === userId || monitorIds.has(alert.monitorId)).length
    };

    this.data.users = this.data.users.filter((user) => user.id !== userId);
    this.data.monitors = this.data.monitors.filter((monitor) => monitor.userId !== userId);
    this.data.observations = this.data.observations.filter((observation) => !monitorIds.has(observation.monitorId));
    this.data.alerts = this.data.alerts.filter((alert) => alert.userId !== userId && !monitorIds.has(alert.monitorId));

    await this.save();
    return deleted;
  }

  async recordObservation(monitorId, offer) {
    const observation = {
      id: newId('obs'),
      monitorId,
      provider: offer.provider,
      price: offer.price,
      currency: offer.currency,
      fingerprint: offer.fingerprint,
      raw: offer,
      checkedAt: nowIso()
    };
    this.data.observations.push(observation);
    const monitor = this.getMonitor(monitorId);
    if (monitor) monitor.lastCheckedAt = observation.checkedAt;
    await this.save();
    return observation;
  }

  async recordAlert(monitor, offer, telegramMessageId) {
    const alert = {
      id: newId('alt'),
      monitorId: monitor.id,
      userId: monitor.userId,
      provider: offer.provider,
      price: offer.price,
      currency: offer.currency,
      fingerprint: offer.fingerprint,
      telegramMessageId: telegramMessageId ? String(telegramMessageId) : '',
      sentAt: nowIso()
    };
    this.data.alerts.push(alert);
    monitor.lastNotifiedFingerprint = offer.fingerprint;
    monitor.updatedAt = nowIso();
    await this.save();
    return alert;
  }
}
