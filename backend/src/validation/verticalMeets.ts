import { ApiError } from '../middleware/errors.js';
import type { DisciplineDefinition, VerticalConfig } from '../types/meets.js';

function invalid(message: string): never { throw new ApiError(400, 'VALIDATION_ERROR', message); }
export function centimetres(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) invalid('Height must be positive metres with at most two decimal places');
  return Math.round(value * 100);
}
export function validateVerticalDefinition(definition: DisciplineDefinition): void {
  if (definition.kind !== 'vertical' || definition.unit !== 'metres' || definition.direction !== 'higher' || definition.precision !== 2 || definition.defaultRules.aggregation !== 'vertical' || definition.defaultRules.entrantType !== 'individual') invalid('Invalid vertical discipline definition');
}
export function parseVerticalConfig(value: unknown): VerticalConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Vertical configuration is required');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !['startingHeight', 'heightIncrement', 'failureLimit', 'round'].includes(key))) invalid('Unknown vertical configuration');
  if (typeof v.startingHeight !== 'number' || typeof v.heightIncrement !== 'number') invalid('Starting height and increment are required');
  centimetres(v.startingHeight); centimetres(v.heightIncrement);
  if (typeof v.failureLimit !== 'number' || !Number.isSafeInteger(v.failureLimit) || v.failureLimit < 1 || v.failureLimit > 10) invalid('Failure limit must be an integer between 1 and 10');
  if (v.round !== 'qualification' && v.round !== 'final') invalid('Round must be qualification or final');
  return v as unknown as VerticalConfig;
}
