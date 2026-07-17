import { formatMonitor, formatOfferAlert, helpText } from './messages.js';
import { searchBestOffers } from './providers/index.js';
import { TelegramClient } from './telegram.js';

const sessions = new Map();

const steps = [
  ['origin', 'Qual e a origem? Ex: GRU'],
  ['destination', 'Qual e o destino? Ex: LIS'],
  ['departureDate', 'Data de ida? Use YYYY-MM-DD'],
  ['returnDate', 'Data de volta? Use YYYY-MM-DD ou digite nao'],
  ['maxPrice', 'Qual preco maximo? Ex: 3500']
];

function normalizeAirport(value) {
  return String(value || '').trim().toUpperCase();
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function parseSearchArgs(text, defaultCurrency) {
  const [, ...args] = text.trim().split(/\s+/);
  if (args.length < 3) return null;
  const [origin, destination, departureDate, maybeReturnOrPrice, maybePrice] = args;
  const hasReturn = isDate(maybeReturnOrPrice);
  return {
    origin: normalizeAirport(origin),
    destination: normalizeAirport(destination),
    departureDate,
    returnDate: hasReturn ? maybeReturnOrPrice : '',
    maxPrice: Number(hasReturn ? maybePrice : maybeReturnOrPrice) || 0,
    currency: defaultCurrency,
    adults: 1,
    cabinClass: 'ECONOMY'
  };
}

async function ensureUser(store, msg) {
  return store.upsertUser({
    telegramChatId: msg.chat.id,
    telegramUsername: msg.from?.username || '',
    firstName: msg.from?.first_name || ''
  });
}

export function createBot({ config, store, providers }) {
  const bot = new TelegramClient(config.telegramBotToken);

  bot.onText(/^\/start$/, async (msg) => {
    await ensureUser(store, msg);
    await bot.sendMessage(msg.chat.id, [
      'Monitor Aereo ativo.',
      '',
      'Use /novo para criar um alerta de passagem.',
      'Use /ajuda para ver todos os comandos.'
    ].join('\n'));
  });

  bot.onText(/^\/ajuda$/, async (msg) => {
    await ensureUser(store, msg);
    await bot.sendMessage(msg.chat.id, helpText());
  });

  bot.onText(/^\/status$/, async (msg) => {
    const user = await ensureUser(store, msg);
    const monitors = await store.listUserMonitors(user.id);
    const active = monitors.filter((monitor) => monitor.active).length;
    await bot.sendMessage(msg.chat.id, [
      `Provedores ativos: ${providers.map((provider) => provider.name).join(', ') || 'nenhum'}`,
      `Alertas ativos: ${active}`,
      `Total de alertas: ${monitors.length}`,
      `Intervalo global: ${config.checkIntervalMinutes} min`
    ].join('\n'));
  });

  bot.onText(/^\/privacidade$/, async (msg) => {
    await ensureUser(store, msg);
    await bot.sendMessage(msg.chat.id, [
      'Dados armazenados: seu chat_id do Telegram, username/nome se disponivel, rotas monitoradas e historico minimo de alertas.',
      'Use /remover <id> para excluir um alerta.',
      'Use /excluir confirmar para apagar todos os seus dados deste bot.'
    ].join('\n'));
  });

  bot.onText(/^\/excluir(?:\s+(.+))?$/, async (msg, match) => {
    const confirmation = String(match[1] || '').trim().toLowerCase();
    const existingUser = await store.getUserByChatId(msg.chat.id);

    if (!existingUser) {
      await bot.sendMessage(msg.chat.id, 'Nao encontrei dados seus para excluir.');
      return;
    }

    if (confirmation !== 'confirmar') {
      await bot.sendMessage(msg.chat.id, [
        'Esta acao apaga seu cadastro, alertas, observacoes e historico de notificacoes deste bot.',
        'Para confirmar, envie:',
        '/excluir confirmar'
      ].join('\n'));
      return;
    }

    const deleted = await store.deleteUserData(existingUser.id);
    sessions.delete(String(msg.chat.id));
    await bot.sendMessage(msg.chat.id, [
      'Seus dados foram excluidos deste bot.',
      `Usuarios removidos: ${deleted.users}`,
      `Alertas removidos: ${deleted.monitors}`,
      `Observacoes removidas: ${deleted.observations}`,
      `Notificacoes removidas: ${deleted.alerts}`
    ].join('\n'));
  });

  bot.onText(/^\/novo$/, async (msg) => {
    await ensureUser(store, msg);
    sessions.set(String(msg.chat.id), { step: 0, values: {} });
    await bot.sendMessage(msg.chat.id, steps[0][1]);
  });

  bot.onText(/^\/alertas$/, async (msg) => {
    const user = await ensureUser(store, msg);
    const monitors = await store.listUserMonitors(user.id);
    if (!monitors.length) {
      await bot.sendMessage(msg.chat.id, 'Voce ainda nao tem alertas. Use /novo para criar um.');
      return;
    }
    await bot.sendMessage(msg.chat.id, monitors.map(formatMonitor).join('\n'));
  });

  bot.onText(/^\/remover\s+(\S+)/, async (msg, match) => {
    const user = await ensureUser(store, msg);
    const removed = await store.removeMonitor(user.id, match[1]);
    await bot.sendMessage(msg.chat.id, removed ? 'Alerta removido.' : 'Nao encontrei esse alerta.');
  });

  bot.onText(/^\/pausar\s+(\S+)/, async (msg, match) => {
    const user = await ensureUser(store, msg);
    const monitor = await store.setMonitorActive(user.id, match[1], false);
    await bot.sendMessage(msg.chat.id, monitor ? 'Alerta pausado.' : 'Nao encontrei esse alerta.');
  });

  bot.onText(/^\/reativar\s+(\S+)/, async (msg, match) => {
    const user = await ensureUser(store, msg);
    const monitor = await store.setMonitorActive(user.id, match[1], true);
    await bot.sendMessage(msg.chat.id, monitor ? 'Alerta reativado.' : 'Nao encontrei esse alerta.');
  });

  bot.onText(/^\/buscar\b/, async (msg) => {
    await ensureUser(store, msg);
    const query = parseSearchArgs(msg.text, config.defaultCurrency);
    if (!query || !isDate(query.departureDate)) {
      await bot.sendMessage(msg.chat.id, 'Formato: /buscar ORIGEM DESTINO IDA [VOLTA] [PRECO_MAX]\nEx: /buscar GRU LIS 2026-09-10 2026-09-25 3500');
      return;
    }
    const { offers, errors } = await searchBestOffers(providers, query);
    if (!offers.length) {
      await bot.sendMessage(msg.chat.id, `Nenhuma oferta encontrada.${errors.length ? `\nErros: ${errors.map((e) => `${e.provider}: ${e.message}`).join('; ')}` : ''}`);
      return;
    }
    const best = offers[0];
    await bot.sendMessage(msg.chat.id, formatOfferAlert({ ...query, maxPrice: query.maxPrice || best.price }, best));
  });

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    const chatId = String(msg.chat.id);
    const session = sessions.get(chatId);
    if (!session) return;

    const [field] = steps[session.step];
    const value = msg.text.trim();

    if ((field === 'origin' || field === 'destination') && normalizeAirport(value).length < 3) {
      await bot.sendMessage(msg.chat.id, 'Use o codigo IATA com 3 letras. Ex: GRU');
      return;
    }
    if (field === 'departureDate' && !isDate(value)) {
      await bot.sendMessage(msg.chat.id, 'Use a data no formato YYYY-MM-DD.');
      return;
    }
    if (field === 'returnDate' && value.toLowerCase() !== 'nao' && !isDate(value)) {
      await bot.sendMessage(msg.chat.id, 'Use YYYY-MM-DD ou digite nao.');
      return;
    }
    if (field === 'maxPrice' && !Number(value)) {
      await bot.sendMessage(msg.chat.id, 'Informe apenas o valor numerico. Ex: 3500');
      return;
    }

    session.values[field] = field === 'returnDate' && value.toLowerCase() === 'nao' ? '' : value;
    session.step += 1;

    if (session.step < steps.length) {
      await bot.sendMessage(msg.chat.id, steps[session.step][1]);
      return;
    }

    const user = await ensureUser(store, msg);
    const monitor = await store.createMonitor({
      ...session.values,
      origin: normalizeAirport(session.values.origin),
      destination: normalizeAirport(session.values.destination),
      currency: config.defaultCurrency,
      userId: user.id,
      checkIntervalMinutes: config.checkIntervalMinutes
    });
    sessions.delete(chatId);
    await bot.sendMessage(msg.chat.id, `Alerta criado:\n${formatMonitor(monitor)}`);
  });

  bot.on('polling_error', (error) => {
    console.error('[telegram polling error]', error.message);
  });

  bot.startPolling();
  return bot;
}

export async function sendOfferAlert(bot, store, monitor, offer) {
  const user = await store.getUserById(monitor.userId);
  if (!user) return;
  const message = await bot.sendMessage(user.telegramChatId, formatOfferAlert(monitor, offer));
  await store.recordAlert(monitor, offer, message.message_id);
}
