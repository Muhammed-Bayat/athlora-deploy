import type { ReactNode } from 'react';
import type { User } from '../../types';
import { CurrentUserContext } from './CurrentUserContext';

interface CurrentUserProviderProps {
  children: ReactNode;
  user: User | null;
}

export function CurrentUserProvider({ children, user }: CurrentUserProviderProps) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}
