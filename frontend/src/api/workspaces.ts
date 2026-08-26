import { request } from './client';
import type { Workspace } from '../types';

export interface WorkspaceListResponse {
  data: Workspace[];
  meta: { count: number; activeWorkspaceId: string };
}

export async function listWorkspaces(): Promise<WorkspaceListResponse> {
  return request<WorkspaceListResponse>('/api/v1/workspaces');
}
