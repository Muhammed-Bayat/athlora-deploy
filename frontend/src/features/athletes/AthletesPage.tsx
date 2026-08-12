import { Card, EmptyState } from '../../components';

export function AthletesPage() {
  return (
    <Card>
      <h2>Roster</h2>
      <EmptyState
        title="No athletes yet"
        description="Add your first athlete to start tracking results and personal bests."
      />
    </Card>
  );
}