import type { ApiList, VenueSearchResult } from '../types';
import { request } from './client';

export function searchVenues(q: string, signal?: AbortSignal): Promise<ApiList<VenueSearchResult>> {
  return request<ApiList<VenueSearchResult>>(`/api/v1/venues/search?q=${encodeURIComponent(q)}`, { signal });
}
