import type { UserRole } from './domain.js';

export interface VerifiedAuth0Context {
  auth0Id: string;
  accessToken: string;
}

export interface ApplicationUserContext {
  userId: string;
  auth0Id: string;
  role: UserRole;
  workspaceId: string;
  workspaceRole: UserRole;
}
