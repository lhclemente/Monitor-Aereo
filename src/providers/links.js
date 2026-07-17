export function buildGoogleFlightsUrl(query) {
  const parts = [
    `flights from ${query.origin} to ${query.destination}`,
    `on ${query.departureDate}`,
    query.returnDate ? `returning ${query.returnDate}` : ''
  ].filter(Boolean);

  const params = new URLSearchParams({
    q: parts.join(' ')
  });

  return `https://www.google.com/travel/flights?${params}`;
}

export function buildAviasalesUrl(query) {
  const params = new URLSearchParams({
    origin: query.origin,
    destination: query.destination,
    depart_date: query.departureDate
  });

  if (query.returnDate) {
    params.set('return_date', query.returnDate);
  }

  return `https://www.aviasales.com/search?${params}`;
}

export function buildTravelpayoutsMarkerUrl(query, marker) {
  const url = new URL(buildAviasalesUrl(query));
  if (marker) {
    url.searchParams.set('marker', marker);
  }
  return url.toString();
}
