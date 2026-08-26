import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { setActiveWorkspaceId } from '../../api/client';
import { listWorkspaces } from '../../api/workspaces';
import type { Workspace } from '../../types';
import { WorkspaceContext } from './WorkspaceContext';

interface WorkspaceProviderProps {
  children: ReactNode;
  subject: string;
  initialWorkspace: Workspace;
  workspaces: Workspace[];
}

function storageKey(subject: string): string {
  return `athlora-active-workspace:${subject}`;
}

export function WorkspaceProvider({ children, subject, initialWorkspace, workspaces }: WorkspaceProviderProps) {
  const [activeWorkspace, setWorkspace] = useState(initialWorkspace);
  const [availableWorkspaces, setAvailableWorkspaces] = useState(workspaces);
  // Child data loaders must see the selected scope during their first effect.
  setActiveWorkspaceId(activeWorkspace.id);

  useEffect(() => {
    setActiveWorkspaceId(activeWorkspace.id);
    try { localStorage.setItem(storageKey(subject), activeWorkspace.id); } catch { /* Persistence is optional. */ }
    return () => setActiveWorkspaceId(undefined);
  }, [activeWorkspace.id, subject]);

  const selectWorkspace = (workspaceId: string) => {
    const workspace = availableWorkspaces.find((candidate) => candidate.id === workspaceId);
    if (workspace) setWorkspace(workspace);
  };

  const refreshWorkspaces = useCallback(async (preferredWorkspaceId?: string) => {
    const response = await listWorkspaces();
    const nextActive = response.data.find((workspace) => workspace.id === preferredWorkspaceId)
      ?? response.data.find((workspace) => workspace.id === activeWorkspace.id)
      ?? response.data.find((workspace) => workspace.id === response.meta.activeWorkspaceId)
      ?? response.data[0];
    if (!nextActive) throw new Error('No workspace is available for this account');
    setAvailableWorkspaces(response.data);
    setWorkspace(nextActive);
  }, [activeWorkspace.id]);

  return <WorkspaceContext.Provider value={{ activeWorkspace, workspaces: availableWorkspaces, selectWorkspace, refreshWorkspaces }}>
    {children}
  </WorkspaceContext.Provider>;
}
