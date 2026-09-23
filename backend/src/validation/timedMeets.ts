import { ApiError } from '../middleware/errors.js';
import type { DisciplineDefinition } from '../types/meets.js';

export function validateTimedDefinition(definition: DisciplineDefinition, config: Record<string, unknown>): void {
  if (definition.unit !== 'seconds' || definition.direction !== 'lower') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Timed discipline must be in seconds with lower-is-better direction');
  }
  if (definition.precision < 0 || definition.precision > 3) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Precision must be between 0 and 3 decimal places');
  }
  const rules = definition.defaultRules;
  if (rules.aggregation !== 'timed') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Discipline definition aggregation must be timed');
  }
  if (config.distance !== undefined && (typeof config.distance !== 'number' || config.distance <= 0)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid distance configuration');
  }
  if (rules.hurdleCount !== undefined && config.hurdleCount !== undefined && config.hurdleCount !== rules.hurdleCount) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Hurdle count configuration mismatch');
  }
}
