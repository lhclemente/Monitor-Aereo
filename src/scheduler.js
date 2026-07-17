import { searchBestOffers } from './providers/index.js';
import { sendOfferAlert } from './bot.js';

function dueForCheck(monitor, globalIntervalMinutes) {
  if (!monitor.lastCheckedAt) return true;
  const interval = Number(monitor.checkIntervalMinutes || globalIntervalMinutes) * 60_000;
  return Date.now() - new Date(monitor.lastCheckedAt).getTime() >= interval;
}

function shouldAlert(monitor, offer) {
  if (!offer || !Number.isFinite(offer.price)) return false;
  if (offer.price > monitor.maxPrice) return false;
  if (offer.fingerprint === monitor.lastNotifiedFingerprint) return false;
  return true;
}

export function startScheduler({ config, store, providers, bot }) {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const activeMonitors = store.listActiveMonitors().filter((monitor) => dueForCheck(monitor, config.checkIntervalMinutes));
      for (const monitor of activeMonitors) {
        const query = {
          origin: monitor.origin,
          destination: monitor.destination,
          departureDate: monitor.departureDate,
          returnDate: monitor.returnDate,
          maxPrice: monitor.maxPrice,
          currency: monitor.currency,
          adults: monitor.adults,
          cabinClass: monitor.cabinClass
        };
        const { offers, errors } = await searchBestOffers(providers, query);
        if (errors.length) {
          console.warn('[provider errors]', monitor.id, errors);
        }
        if (offers[0]) {
          await store.recordObservation(monitor.id, offers[0]);
        }
        const alertable = offers.find((offer) => shouldAlert(monitor, offer));
        if (alertable) {
          await sendOfferAlert(bot, store, monitor, alertable);
        }
      }
    } catch (error) {
      console.error('[scheduler error]', error);
    } finally {
      running = false;
    }
  }

  const intervalMs = Math.max(1, config.checkIntervalMinutes) * 60_000;
  const timer = setInterval(tick, intervalMs);
  setTimeout(tick, 5000);

  return {
    stop() {
      clearInterval(timer);
    },
    tick
  };
}
