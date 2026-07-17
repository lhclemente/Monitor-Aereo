import { ProviderError } from './errors.js';
import { buildTravelpayoutsMarkerUrl } from './links.js';

function parseDateForTravelpayouts(date) {
  return date ? date.slice(0, 7) : '';
}

function daysBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function fingerprint(offer) {
  return [
    'travelpayouts',
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

export function createTravelpayoutsProvider(options) {
  const enabled = Boolean(options.token);

  return {
    name: 'travelpayouts',
    enabled,
    async search(query) {
      if (query.returnDate && daysBetween(query.departureDate, query.returnDate) > 30) {
        throw new ProviderError('unsupported_date_range', 'Travelpayouts cached prices do not support round trips longer than 30 days.', { level: 'info' });
      }

      const params = new URLSearchParams({
        origin: query.origin,
        destination: query.destination,
        depart_date: parseDateForTravelpayouts(query.departureDate),
        currency: query.currency,
        token: options.token
      });

      if (query.returnDate) {
        params.set('return_date', parseDateForTravelpayouts(query.returnDate));
      }

      const response = await fetch(`https://api.travelpayouts.com/v1/prices/cheap?${params}`, {
        headers: { 'Accept-Encoding': 'gzip, deflate' }
      });

      if (!response.ok) {
        const body = await response.text();
        const code = body.includes('exceeds supported maximum of 30') ? 'unsupported_date_range' : 'provider_error';
        throw new ProviderError(code, `Travelpayouts search failed: ${response.status} ${body}`, {
          retryable: response.status >= 500,
          level: code === 'unsupported_date_range' ? 'info' : 'warn'
        });
      }

      const payload = await response.json();
      const routeData = payload.data?.[query.destination] || {};
      return Object.values(routeData).map((item) => {
        const offer = {
          provider: 'travelpayouts',
          sourceLabel: 'Travelpayouts cached data',
          airline: item.airline || '',
          flightNumber: item.flight_number ? `${item.airline || ''}${item.flight_number}` : '',
          origin: query.origin,
          destination: query.destination,
          departureAt: item.departure_at || query.departureDate,
          returnDepartureAt: item.return_at || query.returnDate || '',
          price: Number(item.price || 0),
          currency: query.currency,
          stops: Number(item.transfers ?? 0),
          bookingUrl: buildTravelpayoutsMarkerUrl(query, options.marker),
          expiresAt: item.expires_at || '',
          baggageSummary: 'Preco cacheado; revalidar antes da compra.'
        };
        offer.fingerprint = fingerprint(offer);
        return offer;
      }).filter((offer) => offer.price > 0);
    }
  };
}
