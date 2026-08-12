import { Card, Button } from '../../components';

export function AuthPage() {
  return (
    <Card>
      <h2>Sign in</h2>
      <p>Authentication is wired through Auth0 during Stage 1 setup.</p>
      <Button disabled>Sign in with Auth0</Button>
    </Card>
  );
}