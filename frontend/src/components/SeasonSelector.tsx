import { Select } from './Select';
import { currentSeasonYear, seasonLabel, type SeasonValue, useAvailableSeasons } from '../utils/season';

interface SeasonSelectorProps {
  value: SeasonValue;
  onChange: (season: SeasonValue) => void;
  id?: string;
  availableYears?: number[];
  publicView?: boolean;
}

export function SeasonSelector({ value, onChange, id = 'season-selector', availableYears, publicView = false }: SeasonSelectorProps) {
  const workspaceYears = useAvailableSeasons(!publicView && availableYears === undefined);
  const years = Array.from(new Set([Number(currentSeasonYear()), ...(availableYears ?? workspaceYears)])).sort((left, right) => right - left);
  const options = [
    { value: 'all', label: 'All time' },
    ...years.map((year) => {
      const value = String(year);
      return { value, label: year === Number(currentSeasonYear()) ? `${value} (current)` : value };
    }),
  ];
  return <Select id={id} value={value} onChange={(event) => onChange(event.target.value as SeasonValue)} aria-label={`Season: ${seasonLabel(value)}`} options={options} />;
}
