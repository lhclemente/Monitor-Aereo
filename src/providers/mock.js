function stablePrice(query) {
  const seed = `${query.origin}${query.destination}${query.departureDate}${query.returnDate || ''}`;
  const sum = [...seed].reduce((total, char) => total + char.charCodeAt(0), 0);
  return 800 + (sum % 3200);
}

export function createMockProvider() {
  return {
    name: 'mock',
    enabled: true,
    async search(query) {
      const base = stablePrice(query);
      const price = query.maxPrice ? Math.min(base, Math.max(250, Number(query.maxPrice) - 50)) : base;
      const offer = {
        provider: 'mock',
        sourceLabel: 'Mock provider',
        airline: 'XX',
        flightNumber: 'XX123',
        origin: query.origin,
        destination: query.destination,
        departureAt: `${query.departureDate}T09:00:00`,
        returnDepartureAt: query.returnDate ? `${query.returnDate}T18:00:00` : '',
        price,
        currency: query.currency,
        stops: 0,
        bookingUrl: 'https://example.com/mock-flight',
        expiresAt: '',
        baggageSummary: 'Resultado de teste; configure APIs reais para producao.'
      };
      offer.fingerprint = [
        offer.provider,
        offer.origin,
        offer.destination,
        offer.departureAt,
        offer.returnDepartureAt,
        offer.price,
        offer.currency
      ].join('|');
      return [offer];
    }
  };
}
