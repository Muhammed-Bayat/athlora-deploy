---
sidebar_position: 4
---

# Multi-discipline foundation: migration and data contract

Issue #244 extends `events` as the meet container. This document precedes the
dependent application changes and defines the migration/compatibility boundary.

## Migration

`0028_multi_discipline_meet_foundation.sql` adds a versioned, immutable discipline
catalogue, discipline sessions, meet entrants, relay membership, session
registrations, session timeline entries, session results and a meet audit log.
All entity keys are UUIDs. Composite foreign keys bind registrations and results
to the same event, session, entrant and participating workspace. No historical
100m event, participant, timeline or result row is rewritten or backfilled.

The shared catalogue contains reference data only; tenant-owned data always
belongs to an event/participating workspace. Catalogue versions are immutable and
sessions pin a definition UUID. Rules, precision and presentation metadata are
versioned together. Initial rules support scalar timed and measured results, not
full championship adjudication, vertical countback or relay exchange judging.

Apply the schema before deploying the API and browser contracts. Migrations use
the existing checksummed, transactional, advisory-locked runner. There is no down
migration convention: failed migrations roll back transactionally; application
rollback retains the additive schema/data. Removing populated new tables would
require a separately reviewed data-retention migration.

## Identities and lifecycle

New performance targets are `{ disciplineSessionId, entrantId }` beneath an
`eventId`. Both identifiers are mandatory together. Each entry/result references
one session registration; a result is unique per session/entrant. Legacy targets
remain event/athlete/100m and are never inferred to be a discipline session.

Sessions have independent scheduled/in-progress/completed/cancelled states and
optimistic versions. Logging requires both the event and session to be in
progress. Parent completion stops logging; parent/session cancellation excludes
the results from statistics without deleting history. Definitions and relay
membership cannot be changed underneath recorded performances.

Entrants are `athlete`, `guest`, or `relay`. Athlete references must belong to the
entrant workspace. Guest names are event-local identities, not athlete rows.
Relay members are ordered individual entrants in the same event/workspace.
Registrations can be withdrawn without deleting their results. Mutable changes
record the server-authenticated actor, timestamps and before/after audit details.

## API and authorization

Add catalogue reads at `/api/v1/disciplines` and event-nested `/sessions` and
`/entrants` resources. Session resources contain registrations, entries, results
and statistics. Use existing success/error envelopes and non-enumerating 404s.
The host manages sessions; coaches manage their workspace's entrant roster.
Accepted fixture guests access only their own entrants; host reads use safe
entrant summaries. Session entry creation permits operational actors; correction,
undo and result overrides require coach capability. Public logging uses the
existing event-bound public session and may edit only its own entries.

Event-scoped realtime rooms remain authoritative only for invalidation. Optional
session/entrant identifiers let new consumers target refetches; legacy consumers
still refetch by event. Offline actions carry an explicit session target, stable
action UUID and expected version. Missing target means legacy; incomplete targets
are invalid. New sync processing validates the complete target and binds receipts
to actor/event/target before acknowledging duplicates. Existing pending queues
and legacy APIs remain valid.

## Verification and rollout

Verify a fresh migration and an upgrade from populated 0027, unchanged legacy
rows, checksum/idempotency behavior, transactional rollback and database
constraints. Exercise all entrant types, repeat disciplines in independent
sessions, wrong-parent/workspace denial, optimistic conflicts, audit records,
idempotent sync, and result traceability. Run existing 100m regressions alongside
the new records. Run backend/frontend lint, typecheck, tests and builds, docs
build, and real PostgreSQL integration tests independently of Auth0 E2E secrets.

## AI declaration

Prepared and implemented with OpenCode[openai/gpt-6-astra] for Issue #244.
