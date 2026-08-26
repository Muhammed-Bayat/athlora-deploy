import { useEffect, useState, type ReactNode } from 'react';
import { setActiveWorkspaceId } from '../../api/client';
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
  // Child data loaders must see the selected scope during their first effect.
  setActiveWorkspaceId(activeWorkspace.id);

  useEffect(() => {
    setActiveWorkspaceId(activeWorkspace.id);
    try { localStorage.setItem(storageKey(subject), activeWorkspace.id); } catch { /* Persistence is optional. */ }
    return () => setActiveWorkspaceId(undefined);
  }, [activeWorkspace.id, subject]);

  const selectWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (workspace) setWorkspace(workspace);
  };

  return <WorkspaceContext.Provider value={{ activeWorkspace, workspaces, selectWorkspace }}>
    {children}
  </WorkspaceContext.Provider>;
}
