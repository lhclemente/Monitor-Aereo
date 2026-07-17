function parseDateForTravelpayouts(date) {
  return date ? date.slice(0, 7) : '';
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
        throw new Error(`Travelpayouts search failed: ${response.status} ${await response.text()}`);
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
          bookingUrl: '',
          expiresAt: item.expires_at || '',
          baggageSummary: 'Preco cacheado; revalidar antes da compra.'
        };
        offer.fingerprint = fingerprint(offer);
        return offer;
      }).filter((offer) => offer.price > 0);
    }
  };
}
