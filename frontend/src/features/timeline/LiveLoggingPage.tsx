import { Card, EmptyState } from '../../components';

export function LiveLoggingPage() {
  return (
    <Card tone="ink">
      <h2>Live Event</h2>
      <p style={{ color: 'var(--color-text-light-muted)' }}>
        Pick an in-progress event to log attempts, splits and penalties as they happen.
      </p>
      <EmptyState
        title="No live event"
        description="Start an event from the Events view and the timeline console will appear here."
      />
    </Card>
  );
}