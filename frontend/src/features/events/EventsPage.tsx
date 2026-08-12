import { Card, EmptyState } from '../../components';

export function EventsPage() {
  return (
    <Card>
      <h2>Events</h2>
      <EmptyState
        title="No events scheduled"
        description="Plan a competition or training session to open live logging."
      />
    </Card>
  );
}