import type { DashboardSummary } from '../types';
import { get } from './client';

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return get<DashboardSummary>('dashboard', 'summary');
}
