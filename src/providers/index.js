import { createSerpApiProvider } from './serpapi.js';
import { createTravelpayoutsProvider } from './travelpayouts.js';
import { createMockProvider } from './mock.js';
import { normalizeProviderError } from './errors.js';

export function createProviders(config) {
  const providers = [];

  const serpapi = createSerpApiProvider(config.serpapi);
  if (serpapi.enabled) providers.push(serpapi);

  const travelpayouts = createTravelpayoutsProvider(config.travelpayouts);
  if (travelpayouts.enabled) providers.push(travelpayouts);

  if (config.mockProviderEnabled) {
    providers.push(createMockProvider());
  }

  return providers;
}

export async function searchBestOffers(providers, query) {
  const settled = await Promise.allSettled(providers.map((provider) => provider.search(query)));
  const offers = [];
  const errors = [];

  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const provider = providers[index];
    if (result.status === 'fulfilled') {
      offers.push(...result.value);
    } else {
      errors.push({ provider: provider.name, ...normalizeProviderError(result.reason) });
    }
  }

  offers.sort((a, b) => a.price - b.price);
  return { offers, errors };
}
