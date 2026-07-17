const TEST_BASE_URL = 'https://test.api.amadeus.com';
const PROD_BASE_URL = 'https://api.amadeus.com';

function cabinClass(value) {
  const normalized = String(value || 'ECONOMY').toUpperCase();
  return ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'].includes(normalized) ? normalized : 'ECONOMY';
}

function offerFingerprint(offer) {
  const parts = [
    'amadeus',
    offer.airline || '',
    offer.origin,
    offer.destination,
    offer.departureAt || '',
    offer.returnDepartureAt || '',
    offer.price,
    offer.currency
  ];
  return parts.join('|');
}

export function createAmadeusProvider(options) {
  const enabled = Boolean(options.clientId && options.clientSecret);
  const baseUrl = options.env === 'production' ? PROD_BASE_URL : TEST_BASE_URL;
  let tokenCache = null;

  async function getToken() {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
      return tokenCache.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: options.clientId,
      client_secret: options.clientSecret
    });

    const response = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) {
      throw new Error(`Amadeus auth failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    tokenCache = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + Number(payload.expires_in || 0) * 1000
    };
    return tokenCache.accessToken;
  }

  return {
    name: 'amadeus',
    enabled,
    async search(query) {
      const token = await getToken();
      const params = new URLSearchParams({
        originLocationCode: query.origin,
        destinationLocationCode: query.destination,
        departureDate: query.departureDate,
        adults: String(query.adults || 1),
        currencyCode: query.currency,
        travelClass: cabinClass(query.cabinClass),
        max: '10'
      });

      if (query.returnDate) params.set('returnDate', query.returnDate);
      if (query.maxPrice) params.set('maxPrice', String(Math.ceil(query.maxPrice)));

      const response = await fetch(`${baseUrl}/v2/shopping/flight-offers?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error(`Amadeus search failed: ${response.status} ${await response.text()}`);
      }

      const payload = await response.json();
      return (payload.data || []).map((item) => {
        const firstItinerary = item.itineraries?.[0];
        const firstSegment = firstItinerary?.segments?.[0];
        const returnItinerary = item.itineraries?.[1];
        const returnSegment = returnItinerary?.segments?.[0];
        const offer = {
          provider: 'amadeus',
          sourceLabel: 'Amadeus',
          airline: firstSegment?.carrierCode || item.validatingAirlineCodes?.[0] || '',
          flightNumber: firstSegment ? `${firstSegment.carrierCode}${firstSegment.number}` : '',
          origin: query.origin,
          destination: query.destination,
          departureAt: firstSegment?.departure?.at || query.departureDate,
          returnDepartureAt: returnSegment?.departure?.at || query.returnDate || '',
          price: Number(item.price?.grandTotal || item.price?.total || 0),
          currency: item.price?.currency || query.currency,
          stops: Math.max(0, Number(firstItinerary?.segments?.length || 1) - 1),
          bookingUrl: '',
          expiresAt: item.lastTicketingDate || '',
          baggageSummary: '',
          rawId: item.id
        };
        offer.fingerprint = offerFingerprint(offer);
        return offer;
      }).filter((offer) => offer.price > 0);
    }
  };
}
