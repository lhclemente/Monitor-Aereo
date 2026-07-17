import dotenv from 'dotenv';

dotenv.config();

export const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'BRL',
  dataFile: process.env.DATA_FILE || './data/monitor-aereo.json',
  databaseUrl: process.env.DATABASE_URL || './data/monitor-aereo.sqlite',
  storageDriver: process.env.STORAGE_DRIVER || 'sqlite',
  checkIntervalMinutes: Number(process.env.CHECK_INTERVAL_MINUTES || 30),
  mockProviderEnabled: process.env.MOCK_PROVIDER_ENABLED !== 'false',
  flightapi: {
    apiKey: process.env.FLIGHTAPI_KEY || ''
  },
  serpapi: {
    apiKey: process.env.SERPAPI_API_KEY || '',
    gl: process.env.SERPAPI_GL || 'br',
    hl: process.env.SERPAPI_HL || 'pt-br'
  },
  travelpayouts: {
    token: process.env.TRAVELPAYOUTS_TOKEN || '',
    marker: process.env.TRAVELPAYOUTS_MARKER || ''
  }
};

export function validateConfig() {
  if (!config.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required. Copy .env.example to .env and fill it.');
  }

  if (!Number.isFinite(config.checkIntervalMinutes) || config.checkIntervalMinutes < 1) {
    throw new Error('CHECK_INTERVAL_MINUTES must be a positive number.');
  }

  if (!['json', 'sqlite', 'postgres'].includes(config.storageDriver)) {
    throw new Error('STORAGE_DRIVER must be "json", "sqlite", or "postgres".');
  }

  if (config.storageDriver === 'postgres' && !config.databaseUrl.startsWith('postgres')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string when STORAGE_DRIVER=postgres.');
  }
}
