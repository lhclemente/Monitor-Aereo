import dotenv from 'dotenv';

dotenv.config();

export const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'BRL',
  dataFile: process.env.DATA_FILE || './data/monitor-aereo.json',
  checkIntervalMinutes: Number(process.env.CHECK_INTERVAL_MINUTES || 30),
  mockProviderEnabled: process.env.MOCK_PROVIDER_ENABLED !== 'false',
  amadeus: {
    clientId: process.env.AMADEUS_CLIENT_ID || '',
    clientSecret: process.env.AMADEUS_CLIENT_SECRET || '',
    env: process.env.AMADEUS_ENV || 'test'
  },
  travelpayouts: {
    token: process.env.TRAVELPAYOUTS_TOKEN || ''
  }
};

export function validateConfig() {
  if (!config.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required. Copy .env.example to .env and fill it.');
  }

  if (!Number.isFinite(config.checkIntervalMinutes) || config.checkIntervalMinutes < 1) {
    throw new Error('CHECK_INTERVAL_MINUTES must be a positive number.');
  }
}
