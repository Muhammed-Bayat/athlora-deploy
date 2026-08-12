---
sidebar_position: 2
---

# Result derivation rules

`results` are never typed in by hand — they are derived from `timeline_entries`. The derivation logic lives as pure functions in `backend/src/services/resultDerivation.ts`, unit-tested with Vitest.

## Timed disciplines (track)

Recording a track event produces time values in seconds. The **finishing time** is the largest valid `attempt` value recorded for the athlete/discipline (i.e. the final time, later than any splits).

```ts
deriveResult(entries, 'track')  // → { value, incident }
```

- `dq` / `dnf` / `dns` incidents void the result: `{ value: null, incident: 'dq' }`.
- Fouls do not apply to track (a dimension is a penalty incident instead).

## Measured disciplines (field)

Recording field events produces distance (metres) or height (metres/cm) attempts. The **result is the best valid attempt**.

```ts
deriveResult(entries, 'field')  // → { value, incident }
```

- Foul attempts are skipped (`is_foul`).
- All-foul attempts → `{ value: null, incident: null }`.
- `dq` / `dnf` / `dns` void the result.

## Overrides

Coaches can correct a derived result with `manual_override`, `override_reason`, and `overridden_by` — an audit trail of who corrected what and when. Overrides are stored alongside, not instead of, the derived values.

## Implementation status

`backend/src/services/resultDerivation.ts` implements `deriveFieldBest`, `deriveTrackTime` and `deriveResult`, including DQ/DNF/DNS voiding. It is covered by 8 Vitest unit tests (best-valid-attempt, foul-only attempts, DQ voiding, tied-value semantics). The functions are ready to be called from a results-recompute service once DB access arrives in Stage 1.

## Design note

These rules are deliberately small and pure so they can be unit-tested exhaustively (foul-only attempts, DQ after valid attempts, tied results) and reused by the merge logic in Stage 3, where every synced batch recomputes `results` so all clients converge on the same derived state.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free].