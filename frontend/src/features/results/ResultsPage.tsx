import { Badge, Card, EmptyState } from '../../components';

export function ResultsPage() {
  return (
    <Card>
      <h2>Results</h2>
      <EmptyState
        title="No results yet"
        description="Results are derived automatically from the live event log."
      />
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
        <Badge variant="pb">PB</Badge>
        <Badge variant="sb">SB</Badge>
        <Badge variant="foul">Foul</Badge>
        <Badge variant="dq">DQ</Badge>
        <Badge variant="dnf">DNF</Badge>
        <Badge variant="dns">DNS</Badge>
      </div>
    </Card>
  );
}