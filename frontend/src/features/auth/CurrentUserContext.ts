import { createContext, useContext } from 'react';
import type { User } from '../../types';

export const CurrentUserContext = createContext<User | null | undefined>(undefined);

export function useCurrentUser(): User | null {
  const currentUser = useContext(CurrentUserContext);

  if (currentUser === undefined) {
    throw new Error('useCurrentUser must be used within a CurrentUserProvider');
  }

  return currentUser;
}
