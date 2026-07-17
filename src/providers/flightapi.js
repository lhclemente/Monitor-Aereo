import { ProviderError } from './errors.js';

const BASE_URL = 'https://api.flightapi.io';
const SKYSCANNER_BASE_URL = 'https://www.skyscanner.com';

function cabinClass(value) {
  const normalized = String(value || 'ECONOMY').toUpperCase();
  const classes = {
    ECONOMY: 'Economy',
    PREMIUM_ECONOMY: 'Premium_Economy',
    BUSINESS: 'Business',
    FIRST: 'First'
  };
  return classes[normalized] || 'Economy';
}

function buildUrl(options, query) {
  const parts = [
    BASE_URL,
    query.returnDate ? 'roundtrip' : 'onewaytrip',
    encodeURIComponent(options.apiKey),
    query.origin,
    query.destination,
    query.departureDate
  ];

  if (query.returnDate) {
    parts.push(query.returnDate);
  }

  parts.push(
    String(query.adults || 1),
    String(query.children || 0),
    String(query.infants || 0),
    cabinClass(query.cabinClass),
    query.currency
  );

  return parts.join('/');
}

function makeBookingUrl(item) {
  const url = item?.url || '';
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${SKYSCANNER_BASE_URL}${url}`;
}

function firstPricingOption(itinerary) {
  const options = Array.isArray(itinerary.pricing_options) ? itinerary.pricing_options : [];
  return options
    .filter((option) => Number(option?.price?.amount) > 0)
    .sort((a, b) => Number(a.price.amount) - Number(b.price.amount))[0];
}

function firstItem(option) {
  return Array.isArray(option?.items) ? option.items[0] : null;
}

function findLeg(payload, legId) {
  const legs = Array.isArray(payload.legs) ? payload.legs : [];
  return legs.find((leg) => leg.id === legId) || null;
}

function makeFingerprint(offer) {
  return [
    'flightapi',
    offer.flightNumber,
    offer.origin,
    offer.destination,
    offer.departureAt,
    offer.returnDepartureAt,
    offer.price,
    offer.currency
  ].join('|');
}

function normalizeOffer(payload, itinerary, query) {
  const option = firstPricingOption(itinerary);
  if (!option) return null;

  const item = firstItem(option);
  const outboundLeg = findLeg(payload, itinerary.leg_ids?.[0]);
  const returnLeg = findLeg(payload, itinerary.leg_ids?.[1]);

  const offer = {
    provider: 'flightapi',
    sourceLabel: 'FlightAPI.io',
    airline: '',
    flightNumber: itinerary.id || '',
    origin: query.origin,
    destination: query.destination,
    departureAt: outboundLeg?.departure || query.departureDate,
    returnDepartureAt: returnLeg?.departure || query.returnDate || '',
    price: Number(option.price.amount),
    currency: query.currency,
    stops: Number(outboundLeg?.stop_count ?? 0),
    bookingUrl: makeBookingUrl(item),
    expiresAt: option.price.last_updated || '',
    baggageSummary: 'Preco de metabusca; revalidar antes da compra.',
    rawId: itinerary.id || option.id || ''
  };

  offer.fingerprint = makeFingerprint(offer);
  return offer;
}

export function createFlightApiProvider(options) {
  const enabled = Boolean(options.apiKey);

  return {
    name: 'flightapi',
    enabled,
    async search(query) {
      const response = await fetch(buildUrl(options, query));
      const payload = await response.json().catch(() => null);

      if (response.status === 404 || response.status === 410) {
        throw new ProviderError('no_results', 'FlightAPI did not return results for this query.', { level: 'info' });
      }

      if (response.status === 429) {
        throw new ProviderError('rate_limited', 'FlightAPI rate limit reached.', { retryable: true, level: 'warn' });
      }

      if (!response.ok) {
        throw new ProviderError('provider_http_error', `FlightAPI HTTP error: ${response.status} ${response.statusText}`, {
          retryable: response.status >= 500,
          level: response.status >= 500 ? 'error' : 'warn'
        });
      }

      if (payload?.error) {
        throw new ProviderError('provider_response_error', `FlightAPI returned an error: ${payload.error}`, { level: 'warn' });
      }

      const itineraries = Array.isArray(payload?.itineraries) ? payload.itineraries : [];
      const offers = itineraries
        .map((itinerary) => normalizeOffer(payload, itinerary, query))
        .filter((offer) => offer && offer.price > 0);

      if (!offers.length) {
        throw new ProviderError('no_results', 'FlightAPI did not return priced itineraries for this query.', { level: 'info' });
      }

      return offers;
    }
  };
}
