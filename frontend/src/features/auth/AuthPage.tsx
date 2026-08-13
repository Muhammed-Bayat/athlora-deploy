import { useAuth0 } from '@auth0/auth0-react';
import { Card, Button } from '../../components';

export function AuthPage() {
  const { error, isAuthenticated, isLoading, loginWithRedirect, logout, user } = useAuth0();

  if (isLoading) {
    return (
      <Card>
        <h2>Account</h2>
        <p>Loading your account...</p>
      </Card>
    );
  }

  if (isAuthenticated) {
    return (
      <Card>
        <h2>Account</h2>
        <p>Signed in as {user?.name ?? user?.email ?? 'Athlora user'}.</p>
        <Button
          variant="secondary"
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        >
          Sign out
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <h2>Sign in</h2>
      <p>Sign in or create an account to manage your athletes and events.</p>
      {error ? <p role="alert">Authentication failed: {error.message}</p> : null}
      <Button onClick={() => loginWithRedirect()}>Sign in with Auth0</Button>{' '}
      <Button
        variant="secondary"
        onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}
      >
        Create account
      </Button>
    </Card>
  );
}
