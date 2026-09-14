import { useEffect, useState } from 'react';
import { listWorkspaceSeasons } from '../api/workspaces';

export type SeasonValue = 'all' | `${number}`;

export function currentSeasonYear(): `${number}` {
  return String(new Date().getUTCFullYear()) as `${number}`;
}

export function normalizeSeason(value: string | null): SeasonValue {
  return value === 'all' || /^\d{4}$/.test(value ?? '') ? value as SeasonValue : currentSeasonYear();
}

export function seasonLabel(season: SeasonValue): string {
  return season === 'all' ? 'All time' : season;
}

export function seasonQueryValue(season: SeasonValue): string | undefined {
  return season === currentSeasonYear() ? undefined : season;
}

export function useSeasonQueryState(): [SeasonValue, (season: SeasonValue) => void] {
  const [season, setSeason] = useState(() => normalizeSeason(new URLSearchParams(window.location.search).get('year')));

  useEffect(() => {
    const sync = () => setSeason(normalizeSeason(new URLSearchParams(window.location.search).get('year')));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const updateSeason = (nextSeason: SeasonValue) => {
    const url = new URL(window.location.href);
    const value = seasonQueryValue(nextSeason);
    if (value) url.searchParams.set('year', value);
    else url.searchParams.delete('year');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    setSeason(nextSeason);
  };

  return [season, updateSeason];
}

export function useAvailableSeasons(enabled = true): number[] {
  const [years, setYears] = useState<number[]>([Number(currentSeasonYear())]);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void listWorkspaceSeasons()
      .then((values) => { if (current) setYears(values); })
      .catch(() => { if (current) setYears([Number(currentSeasonYear())]); });
    return () => { current = false; };
  }, [enabled]);

  return years;
}
