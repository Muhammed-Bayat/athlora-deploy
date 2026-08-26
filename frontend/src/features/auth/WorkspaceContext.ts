import { createContext, useContext } from 'react';
import type { Workspace } from '../../types';

export interface WorkspaceSession {
  activeWorkspace: Workspace;
  workspaces: Workspace[];
  selectWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: (preferredWorkspaceId?: string) => Promise<void>;
}

const standaloneWorkspace: Workspace = { id: '00000000-0000-4000-8000-000000000000', name: 'Personal workspace', timezone: 'UTC', role: 'coach' };
const standaloneSession: WorkspaceSession = {
  activeWorkspace: standaloneWorkspace,
  workspaces: [standaloneWorkspace],
  selectWorkspace: () => undefined,
  refreshWorkspaces: async () => undefined,
};

// This fallback keeps isolated component renders usable; authenticated app routes
// always replace it with a validated session from WorkspaceProvider.
export const WorkspaceContext = createContext<WorkspaceSession>(standaloneSession);

export function useWorkspace(): WorkspaceSession {
  return useContext(WorkspaceContext);
}
