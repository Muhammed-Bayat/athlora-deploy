import { useEffect, type ReactNode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { setAccessTokenGetter, syncCurrentUser } from '../../api/client';

interface Auth0TokenBridgeProps {
  children: ReactNode;
}

export function Auth0TokenBridge({ children }: Auth0TokenBridgeProps) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  useEffect(() => {
    setAccessTokenGetter(isAuthenticated ? getAccessTokenSilently : undefined);

    if (isAuthenticated) {
      void getAccessTokenSilently()
        .then(syncCurrentUser)
        .catch((error: unknown) => {
          console.error('Could not synchronize the authenticated user', error);
        });
    }

    return () => setAccessTokenGetter(undefined);
  }, [getAccessTokenSilently, isAuthenticated]);

  return children;
}
