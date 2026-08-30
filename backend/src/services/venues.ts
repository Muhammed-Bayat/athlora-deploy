import { ApiError } from '../middleware/errors.js';

export interface VenueSearchResult {
  displayName: string;
  latitude: number;
  longitude: number;
}

interface NominatimPlace {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
}

const cache = new Map<string, { expiresAt: number; results: VenueSearchResult[] }>();
let nextProviderRequestAt = 0;
const CACHE_MS = 5 * 60_000;
const THROTTLE_MS = 1_000;

function invalidResponse(): never {
  throw new ApiError(502, 'VENUE_SERVICE_INVALID_RESPONSE', 'The venue service returned invalid data');
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

async function waitForProviderSlot(): Promise<void> {
  const now = Date.now();
  const delay = Math.max(0, nextProviderRequestAt - now);
  nextProviderRequestAt = Math.max(now, nextProviderRequestAt) + THROTTLE_MS;
  if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

function parseResults(body: unknown): VenueSearchResult[] {
  if (!Array.isArray(body)) invalidResponse();
  return body.slice(0, 5).map((place): VenueSearchResult => {
    if (typeof place !== 'object' || place === null || Array.isArray(place)) invalidResponse();
    const { display_name: displayName, lat, lon } = place as NominatimPlace;
    const latitude = typeof lat === 'string' ? Number(lat) : NaN;
    const longitude = typeof lon === 'string' ? Number(lon) : NaN;
    if (typeof displayName !== 'string' || !displayName.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) invalidResponse();
    return { displayName, latitude, longitude };
  });
}

export async function searchVenues(q: string, fetcher: typeof fetch = fetch): Promise<VenueSearchResult[]> {
  const key = q.toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.results;

  await waitForProviderSlot();
  const url = new URL('/search', process.env.NOMINATIM_BASE_URL ?? 'https://nominatim.openstreetmap.org');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '0');
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/json', 'User-Agent': process.env.NOMINATIM_USER_AGENT ?? 'Athlora venue search (configure NOMINATIM_USER_AGENT)' },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    if (isTimeout(error)) throw new ApiError(504, 'VENUE_SERVICE_TIMEOUT', 'The venue service took too long to respond');
    throw new ApiError(502, 'VENUE_SERVICE_UNAVAILABLE', 'The venue service is temporarily unavailable');
  }
  if (!response.ok) throw new ApiError(502, 'VENUE_SERVICE_UNAVAILABLE', 'The venue service is temporarily unavailable');
  let body: unknown;
  try {
    body = await response.json() as unknown;
  } catch (error) {
    if (isTimeout(error)) throw new ApiError(504, 'VENUE_SERVICE_TIMEOUT', 'The venue service took too long to respond');
    invalidResponse();
  }
  const results = parseResults(body);
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, results });
  return results;
}

export function clearVenueSearchCache(): void {
  cache.clear();
  nextProviderRequestAt = 0;
}
