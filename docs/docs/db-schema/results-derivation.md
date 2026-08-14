---
sidebar_position: 2
---

# Result derivation rules

`results` are never typed in by hand — they are derived from `timeline_entries`. The derivation logic lives as pure functions in `backend/src/services/resultDerivation.ts`, unit-tested with Vitest. Every derivation returns `{ value, incident, outcome }`, where `outcome` is `no_result` | `valid` | `dq` | `dnf` | `dns`.

The MVP discipline is fixed to **100m** (track, timed) with unit **seconds** at the API/service boundary — see the [100m data/API contract](/docs/api-reference/contract). `DISCIPLINE_KIND` maps `'100m'` → `'track'`.

## Timed disciplines (track)

Recording a track event produces time values in seconds. The **finishing time** is the largest valid `attempt` value recorded for the athlete/discipline (i.e. the final time, later than any splits).

```ts
deriveTrackTime(entries)  // → { value, incident, outcome }
```

- A valid finish → `{ value, incident: null, outcome: 'valid' }`.
- `dq` / `dnf` / `dns` incidents void the result: `{ value: null, incident, outcome: <same> }`.
- No valid attempt (or no attempts) → `{ value: null, incident: null, outcome: 'no_result' }`.
- Fouls do not apply to track (a dimension is a penalty incident instead).

## Measured disciplines (field)

Recording field events produces distance (metres) or height (metres/cm) attempts. The **result is the best valid attempt**.

```ts
deriveFieldBest(entries)  // → { value, incident, outcome }
```

- Foul attempts are skipped (`is_foul`).
- All-foul attempts → `{ value: null, incident: null, outcome: 'no_result' }`.
- `dq` / `dnf` / `dns` void the result.

## Overrides

Coaches can correct a derived result with `manual_override`, `override_reason`, `overridden_by`, and `override_at` — an audit trail of who corrected what, when, and why. Overrides are stored alongside, not instead of, the derived values.

## PB/SB rules

`is_pb` is true when the athlete's result is better (lower time) than every previously recorded result for the same discipline; `is_sb` is true when it beats the best result recorded in the current season. Only `outcome = 'valid'` results count — voided outcomes never set PB/SB. When a manual override is present, statistics are computed from the override value.

## Implementation status

`backend/src/services/resultDerivation.ts` implements `deriveFieldBest`, `deriveTrackTime` and `deriveResult`, including DQ/DNF/DNS voiding and the derived `outcome`. It is covered by Vitest unit tests (best-valid-attempt, foul-only attempts, DQ/DNF/DNS voiding, no-result semantics, tied-value semantics). The functions are ready to be called from a results-recompute service once DB access arrives in Stage 1, and they align with the `results.outcome` column added by migration `0002_contract_100m.sql`.

## Design note

These rules are deliberately small and pure so they can be unit-tested exhaustively (foul-only attempts, DQ after valid attempts, tied results) and reused by the merge logic in Stage 3, where every synced batch recomputes `results` so all clients converge on the same derived state.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free].