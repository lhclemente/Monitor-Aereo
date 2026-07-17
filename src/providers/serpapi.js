import { ProviderError } from './errors.js';
import { buildGoogleFlightsUrl } from './links.js';

function travelClass(value) {
  const normalized = String(value || 'ECONOMY').toUpperCase();
  const classes = {
    ECONOMY: '1',
    PREMIUM_ECONOMY: '2',
    BUSINESS: '3',
    FIRST: '4'
  };
  return classes[normalized] || '1';
}

function pickFlights(payload) {
  return [
    ...(Array.isArray(payload.best_flights) ? payload.best_flights : []),
    ...(Array.isArray(payload.other_flights) ? payload.other_flights : [])
  ];
}

function flightNumber(segment) {
  if (segment.flight_number) return segment.flight_number;
  if (segment.airline && segment.flight_number) return `${segment.airline}${segment.flight_number}`;
  return '';
}

function makeFingerprint(offer) {
  return [
    'serpapi',
    offer.airline,
    offer.flightNumber,
    offer.origin,
    offer.destination,
    offer.departureAt,
    offer.returnDepartureAt,
    offer.price,
    offer.currency
  ].join('|');
}

function normalizeOffer(item, query) {
  const segments = Array.isArray(item.flights) ? item.flights : [];
  const first = segments[0] || {};
  const last = segments[segments.length - 1] || first;
  const departure = first.departure_airport || {};
  const arrival = last.arrival_airport || {};
  const price = Number(item.price || 0);

  const offer = {
    provider: 'serpapi',
    sourceLabel: 'SerpApi Google Flights',
    airline: first.airline || '',
    flightNumber: flightNumber(first),
    origin: departure.id || query.origin,
    destination: arrival.id || query.destination,
    departureAt: departure.time || query.departureDate,
    returnDepartureAt: query.returnDate || '',
    price,
    currency: query.currency,
    stops: Math.max(0, segments.length - 1),
    bookingUrl: buildGoogleFlightsUrl(query),
    expiresAt: '',
    baggageSummary: item.extensions?.join(', ') || '',
    rawId: item.booking_token || ''
  };

  offer.fingerprint = makeFingerprint(offer);
  return offer;
}

export function createSerpApiProvider(options) {
  const enabled = Boolean(options.apiKey);

  return {
    name: 'serpapi',
    enabled,
    async search(query) {
      const params = new URLSearchParams({
        engine: 'google_flights',
        departure_id: query.origin,
        arrival_id: query.destination,
        outbound_date: query.departureDate,
        currency: query.currency,
        travel_class: travelClass(query.cabinClass),
        type: query.returnDate ? '1' : '2',
        gl: options.gl || 'br',
        hl: options.hl || 'pt-br',
        api_key: options.apiKey
      });

      if (query.returnDate) {
        params.set('return_date', query.returnDate);
      }

      const response = await fetch(`https://serpapi.com/search.json?${params}`);
      const payload = await response.json().catch(() => null);

      if (response.ok && payload?.error && payload.error.includes("hasn't returned any results")) {
        throw new ProviderError('no_results', 'SerpApi did not return results for this query.', { level: 'info' });
      }

      if (response.ok && payload?.error) {
        throw new ProviderError('provider_response_error', `SerpApi returned an error: ${payload.error}`, {
          retryable: false,
          level: 'warn'
        });
      }

      if (!response.ok) {
        throw new ProviderError('provider_http_error', `SerpApi HTTP error: ${response.status} ${response.statusText}`, {
          retryable: response.status >= 500,
          level: response.status >= 500 ? 'error' : 'warn'
        });
      }

      return pickFlights(payload)
        .map((item) => normalizeOffer(item, query))
        .filter((offer) => offer.price > 0);
    }
  };
}
