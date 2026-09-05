const SQUAD = 'E2E';

export function uniqueToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function athleteNames(token: string) {
  return {
    alpha: `E2E Alpha ${token}`,
    bravo: `E2E Bravo ${token}`,
    charlie: `E2E Charlie ${token}`,
    delta: `E2E Delta ${token}`,
  };
}

export function eventNames(token: string) {
  return {
    competition: `E2E Competition ${token}`,
    training: `E2E Training ${token}`,
  };
}

export function squadName(): string {
  return SQUAD;
}

export function todayIso(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
