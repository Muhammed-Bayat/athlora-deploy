import { Card, EmptyState } from '../../components';

export function DashboardPage() {
  return (
    <Card tone="flat">
      <EmptyState
        title="Welcome to Athlora"
        description="Run the whole season from one place. Manage your roster, plan events and log results live."
      />
    </Card>
  );
}