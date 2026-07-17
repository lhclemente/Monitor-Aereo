import { config, validateConfig } from './config.js';
import { createStore } from './storage/index.js';
import { createProviders } from './providers/index.js';
import { createBot } from './bot.js';
import { startScheduler } from './scheduler.js';

validateConfig();

const store = createStore(config);
await store.load();

const providers = createProviders(config);
if (!providers.length) {
  console.warn('No providers enabled. Set MOCK_PROVIDER_ENABLED=true or configure API credentials.');
}

const bot = createBot({ config, store, providers });
const scheduler = startScheduler({ config, store, providers, bot });

console.log(`Monitor Aereo started with providers: ${providers.map((provider) => provider.name).join(', ') || 'none'}`);
console.log(`Storage driver: ${config.storageDriver}`);

async function shutdown() {
  console.log('Shutting down...');
  scheduler.stop();
  await bot.stopPolling();
  store.close?.();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
