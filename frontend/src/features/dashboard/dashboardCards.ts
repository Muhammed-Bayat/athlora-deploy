import {
  DEFAULT_DASHBOARD_CARD_ORDER,
  HIDEABLE_DASHBOARD_CARD_IDS,
  REQUIRED_DASHBOARD_CARD_IDS,
  type DashboardCardId,
} from '../../types';

export interface DashboardCardMeta {
  id: DashboardCardId;
  label: string;
  description: string;
  required: boolean;
}

export const DASHBOARD_CARDS: readonly DashboardCardMeta[] = [
  {
    id: 'season-selector',
    label: 'Season selector',
    description: 'Choose the season or all-time scope.',
    required: true,
  },
  {
    id: 'hero',
    label: 'Summary hero',
    description: 'Greeting and headline roster numbers.',
    required: true,
  },
  {
    id: 'status-attention',
    label: 'Status attention',
    description: 'Inactive athletes and pending status reviews.',
    required: true,
  },
  {
    id: 'stats',
    label: 'Season statistics',
    description: 'Key roster and performance tiles.',
    required: false,
  },
  {
    id: 'roster-snapshot',
    label: 'Roster snapshot',
    description: 'Top athletes with personal bests.',
    required: false,
  },
  {
    id: 'upcoming-events',
    label: 'Upcoming events',
    description: 'Next competitions and training sessions.',
    required: false,
  },
  {
    id: 'pb-trend',
    label: 'Squad PB trend',
    description: 'Weekly personal-best momentum.',
    required: false,
  },
  {
    id: 'recent-results',
    label: 'Recent results',
    description: 'Latest recorded finishes and outcomes.',
    required: false,
  },
  {
    id: 'recent-pbs',
    label: 'Recent PBs',
    description: 'Latest personal bests on the board.',
    required: false,
  },
];

export const REQUIRED_CARDS: readonly DashboardCardId[] = REQUIRED_DASHBOARD_CARD_IDS;
export const HIDEABLE_CARDS: readonly DashboardCardId[] = HIDEABLE_DASHBOARD_CARD_IDS;
export const DEFAULT_CARD_ORDER: readonly DashboardCardId[] = DEFAULT_DASHBOARD_CARD_ORDER;

const CARD_META = new Map(DASHBOARD_CARDS.map((card) => [card.id, card] as const));

export function dashboardCardMeta(id: DashboardCardId): DashboardCardMeta {
  const meta = CARD_META.get(id);
  if (!meta) throw new Error(`Unknown dashboard card: ${id}`);
  return meta;
}

const KNOWN_IDS = new Set<string>(DEFAULT_CARD_ORDER);

function uniqueKnownIds(values: unknown, allowed?: ReadonlySet<string>): DashboardCardId[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: DashboardCardId[] = [];
  for (const value of values) {
    if (typeof value !== 'string' || !KNOWN_IDS.has(value) || seen.has(value)) continue;
    if (allowed && !allowed.has(value)) continue;
    seen.add(value);
    result.push(value as DashboardCardId);
  }
  return result;
}

export function normalizeCardOrder(values: unknown): DashboardCardId[] {
  const stored = uniqueKnownIds(values);
  const index = new Map(stored.map((card, position) => [card, position] as const));
  return [...DEFAULT_CARD_ORDER].sort((left, right) => {
    const leftIndex = index.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = index.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return DEFAULT_CARD_ORDER.indexOf(left) - DEFAULT_CARD_ORDER.indexOf(right);
  });
}

export function normalizeHiddenCards(values: unknown): DashboardCardId[] {
  const hideable = new Set<string>(HIDEABLE_CARDS);
  return uniqueKnownIds(values, hideable);
}

export function isRequiredCard(id: DashboardCardId): boolean {
  return REQUIRED_CARDS.includes(id);
}

export function isHideableCard(id: DashboardCardId): boolean {
  return HIDEABLE_CARDS.includes(id);
}

export function moveCardOrder(order: readonly DashboardCardId[], id: DashboardCardId, direction: -1 | 1): DashboardCardId[] {
  const index = order.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return [...order];
  const next = [...order];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

export function defaultUserPreferences(): {
  dashboardCardOrder: DashboardCardId[];
  dashboardHiddenCards: DashboardCardId[];
  dashboardSavedFilters: [];
} {
  return {
    dashboardCardOrder: [...DEFAULT_CARD_ORDER],
    dashboardHiddenCards: [],
    dashboardSavedFilters: [],
  };
}
