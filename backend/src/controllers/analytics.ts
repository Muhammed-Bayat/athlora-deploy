import type { RequestHandler } from 'express';
import { getPool } from '../db/client.js';
import { getApplicationUserContext } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import {
  getAthleteDisciplineAnalytics,
  getWorkspaceDisciplineAnalytics,
} from '../services/athleteAnalytics.js';
import {
  getCoachInjuryAnalytics,
  getCoachPerformanceAnalytics,
  getCoachRankingsAnalytics,
  type CoachDateRange,
  type CoachInjuryQuery,
  type CoachLifecycleStatus,
  type CoachPerformanceQuery,
  type CoachRankingsQuery,
} from '../services/coachAnalytics.js';
import { isSupportedDiscipline } from '../services/disciplineCatalog.js';
import { parseSeasonYear } from '../services/seasons.js';
import { isCanonicalUuid, isGregorianDate } from '../validation/primitives.js';

const MAX_COACH_ATHLETE_IDS = 100;
const MAX_COACH_RANKING_LIMIT = 100;

interface QueryIssue {
  path: string;
  code: string;
  message: string;
}

function invalidQuery(issues: QueryIssue[]): never {
  throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', {
    issues: issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code)),
  });
}

function rejectUnknownQueryFields(input: Record<string, unknown>, allowed: readonly string[], issues: QueryIssue[]): void {
  for (const field of Object.keys(input)) {
    if (!allowed.includes(field)) issues.push({ path: field, code: 'unknown_field', message: 'Unknown query field' });
  }
}

function optionalQueryString(input: Record<string, unknown>, field: string, issues: QueryIssue[]): string | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push({ path: field, code: 'invalid_value', message: 'Expected a non-empty string' });
    return undefined;
  }
  return value.trim();
}

function parseDateRange(input: Record<string, unknown>, issues: QueryIssue[]): CoachDateRange {
  const dateFrom = optionalQueryString(input, 'dateFrom', issues);
  const dateTo = optionalQueryString(input, 'dateTo', issues);
  if (dateFrom !== undefined && !isGregorianDate(dateFrom)) {
    issues.push({ path: 'dateFrom', code: 'invalid_format', message: 'Expected a real date in YYYY-MM-DD format' });
  }
  if (dateTo !== undefined && !isGregorianDate(dateTo)) {
    issues.push({ path: 'dateTo', code: 'invalid_format', message: 'Expected a real date in YYYY-MM-DD format' });
  }
  if (dateFrom !== undefined && dateTo !== undefined && isGregorianDate(dateFrom) && isGregorianDate(dateTo) && dateFrom > dateTo) {
    issues.push({ path: 'dateFrom', code: 'invalid_range', message: 'dateFrom must not be after dateTo' });
  }
  return { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null };
}

function parseAthleteIds(input: Record<string, unknown>, issues: QueryIssue[]): string[] | undefined {
  const value = optionalQueryString(input, 'athleteIds', issues);
  if (value === undefined) return undefined;
  const athleteIds = value.split(',').map((id) => id.trim());
  if (athleteIds.length === 0 || athleteIds.some((id) => !isCanonicalUuid(id))) {
    issues.push({ path: 'athleteIds', code: 'invalid_format', message: 'Expected comma-separated canonical UUIDs' });
    return undefined;
  }
  if (athleteIds.length > MAX_COACH_ATHLETE_IDS) {
    issues.push({ path: 'athleteIds', code: 'too_many', message: `Expected at most ${MAX_COACH_ATHLETE_IDS} athlete IDs` });
  }
  if (new Set(athleteIds).size !== athleteIds.length) {
    issues.push({ path: 'athleteIds', code: 'duplicate', message: 'Athlete IDs must be unique' });
  }
  return athleteIds;
}

function parseLifecycleStatus(input: Record<string, unknown>, issues: QueryIssue[]): CoachLifecycleStatus {
  const value = optionalQueryString(input, 'lifecycleStatus', issues);
  if (value === undefined) return 'all';
  if (value === 'active' || value === 'inactive' || value === 'all') return value;
  issues.push({ path: 'lifecycleStatus', code: 'invalid_value', message: 'Expected active, inactive, or all' });
  return 'all';
}

function parseDiscipline(
  input: Record<string, unknown>,
  issues: QueryIssue[],
  required: boolean,
): string | undefined {
  const value = optionalQueryString(input, 'discipline', issues);
  if (value === undefined) {
    if (required && input.discipline === undefined) {
      issues.push({ path: 'discipline', code: 'required', message: 'Discipline is required' });
    }
    return undefined;
  }
  if (!/^[a-z0-9][a-z0-9_]*$/.test(value) || !isSupportedDiscipline(value)) {
    issues.push({ path: 'discipline', code: 'invalid_value', message: 'Expected a supported discipline code' });
    return undefined;
  }
  return value;
}

function parseCoachPerformanceQuery(input: Record<string, unknown>): CoachPerformanceQuery {
  const issues: QueryIssue[] = [];
  rejectUnknownQueryFields(input, ['athleteIds', 'discipline', 'dateFrom', 'dateTo', 'lifecycleStatus', 'limit'], issues);
  const athleteIds = parseAthleteIds(input, issues);
  const discipline = parseDiscipline(input, issues, false);
  const dateRange = parseDateRange(input, issues);
  const lifecycleStatus = parseLifecycleStatus(input, issues);
  const limitValue = optionalQueryString(input, 'limit', issues);
  let limit: number | undefined;
  if (limitValue !== undefined) {
    if (!/^\d+$/.test(limitValue) || Number(limitValue) < 1 || Number(limitValue) > MAX_COACH_RANKING_LIMIT) {
      issues.push({ path: 'limit', code: 'invalid_value', message: `Expected an integer from 1 to ${MAX_COACH_RANKING_LIMIT}` });
    } else {
      limit = Number(limitValue);
    }
  }
  if (issues.length > 0) invalidQuery(issues);
  return {
    ...(athleteIds === undefined ? {} : { athleteIds }),
    ...(discipline === undefined ? {} : { discipline }),
    ...(limit === undefined ? {} : { limit }),
    dateRange,
    lifecycleStatus,
  };
}

function parseCoachInjuryQuery(input: Record<string, unknown>): CoachInjuryQuery {
  const issues: QueryIssue[] = [];
  rejectUnknownQueryFields(input, ['athleteIds', 'dateFrom', 'dateTo', 'lifecycleStatus'], issues);
  const athleteIds = parseAthleteIds(input, issues);
  const dateRange = parseDateRange(input, issues);
  const lifecycleStatus = parseLifecycleStatus(input, issues);
  if (issues.length > 0) invalidQuery(issues);
  return { ...(athleteIds === undefined ? {} : { athleteIds }), dateRange, lifecycleStatus };
}

function parseCoachRankingsQuery(input: Record<string, unknown>): CoachRankingsQuery {
  const issues: QueryIssue[] = [];
  rejectUnknownQueryFields(input, ['discipline', 'dateFrom', 'dateTo', 'lifecycleStatus', 'limit'], issues);
  const discipline = parseDiscipline(input, issues, true);
  const dateRange = parseDateRange(input, issues);
  const lifecycleStatus = parseLifecycleStatus(input, issues);
  const limitValue = optionalQueryString(input, 'limit', issues);
  let limit = 50;
  if (limitValue !== undefined) {
    if (!/^\d+$/.test(limitValue) || Number(limitValue) < 1 || Number(limitValue) > MAX_COACH_RANKING_LIMIT) {
      issues.push({ path: 'limit', code: 'invalid_value', message: `Expected an integer from 1 to ${MAX_COACH_RANKING_LIMIT}` });
    } else {
      limit = Number(limitValue);
    }
  }
  if (issues.length > 0) invalidQuery(issues);
  return { discipline: discipline!, dateRange, lifecycleStatus, limit };
}

export const getAthleteDisciplineAnalysis: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const analysis = await getAthleteDisciplineAnalytics(
      workspaceId,
      req.params.id,
      req.params.discipline,
      parseSeasonYear(req.query.year),
      getPool(),
    );
    res.json({ data: analysis });
  } catch (error) {
    next(error);
  }
};

export const getWorkspaceDisciplineAnalysis: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const analysis = await getWorkspaceDisciplineAnalytics(
      workspaceId,
      req.params.discipline,
      parseSeasonYear(req.query.year),
      getPool(),
    );
    res.json({ data: analysis });
  } catch (error) {
    next(error);
  }
};

export const getCoachPerformanceAnalysis: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const analysis = await getCoachPerformanceAnalytics(
      workspaceId,
      parseCoachPerformanceQuery(req.query as Record<string, unknown>),
      getPool(),
    );
    res.json({ data: analysis });
  } catch (error) {
    next(error);
  }
};

export const getCoachInjuryAnalysis: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const analysis = await getCoachInjuryAnalytics(
      workspaceId,
      parseCoachInjuryQuery(req.query as Record<string, unknown>),
      getPool(),
    );
    res.json({ data: analysis });
  } catch (error) {
    next(error);
  }
};

export const getCoachRankingsAnalysis: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const analysis = await getCoachRankingsAnalytics(
      workspaceId,
      parseCoachRankingsQuery(req.query as Record<string, unknown>),
      getPool(),
    );
    res.json({ data: analysis });
  } catch (error) {
    next(error);
  }
};
