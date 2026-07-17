import { JsonStore } from './json-store.js';
import { SqliteStore } from './sqlite-store.js';

export function createStore(config) {
  if (config.storageDriver === 'json') {
    return new JsonStore(config.dataFile);
  }

  if (config.storageDriver === 'sqlite') {
    return new SqliteStore(config.databaseUrl);
  }

  throw new Error(`Unsupported STORAGE_DRIVER: ${config.storageDriver}`);
}

export { JsonStore } from './json-store.js';
export { SqliteStore } from './sqlite-store.js';
