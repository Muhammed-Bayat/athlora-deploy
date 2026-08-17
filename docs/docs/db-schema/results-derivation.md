---
sidebar_position: 2
---

# Result derivation rules

`results` are never typed in by hand — they are derived from `timeline_entries`. The derivation logic lives as pure functions in `backend/src/services/resultDerivation.ts`, unit-tested with Vitest. Every derivation returns `{ value, incident, outcome }`, where `outcome` is `no_result` | `valid` | `dq` | `dnf` | `dns`.

The MVP discipline is fixed to **100m** (track, timed) with unit **seconds** at the API/service boundary — see the [100m data/API contract](/docs/api-reference/contract). `DISCIPLINE_KIND` maps `'100m'` → `'track'`.

## Timed disciplines (track)

Recording a track event produces time values in seconds. The finishing time follows the 100m sprint timing rules in `deriveTrackTime(entries, eventType)` — the event type decides how the time is read from the active attempts:

- **Competition** (`eventType = 'competition'`, the default): a single active finish. The finishing time is the **latest** valid `attempt` in the timeline (the final time, recorded after any splits).
- **Training** (`eventType = 'training'`): the finishing time is the **fastest** (lowest) valid positive `attempt` — the quickest rep is the one that counts.

```ts
deriveTrackTime(entries, eventType = 'competition')  // → { value, incident, outcome }
```

- Only `attempt` entries count; soft-deleted entries (`deletedAt` set) and zero/negative/non-finite values are ignored.
- A valid finish → `{ value, incident: null, outcome: 'valid' }`.
- `dq` / `dnf` / `dns` incidents void the result: `{ value: null, incident, outcome: <same> }`.
- No valid attempt (or no attempts) → `{ value: null, incident: null, outcome: 'no_result' }`.
- `false_start` and `lane_infringement` are penalty incidents and do not void the result — a `dq` entry must be recorded to void it. Fouls do not apply to track.

## Measured disciplines (field)

Recording field events produces distance (metres) or height (metres/cm) attempts. The **result is the best valid attempt**.

```ts
deriveFieldBest(entries)  // → { value, incident, outcome }
```

- Foul attempts are skipped (`is_foul`), as are soft-deleted entries and non-positive values.
- All-foul attempts → `{ value: null, incident: null, outcome: 'no_result' }`.
- `dq` / `dnf` / `dns` void the result.

## Overrides

Coaches can correct a derived result with `manual_override`, `override_reason`, `overridden_by`, and `override_at` — an audit trail of who corrected what, when, and why. Overrides are stored alongside, not instead of, the derived values. `deriveEffectiveResult(derived, manualOverride)` computes the effective result: when a positive override is present its value replaces the derived value (and promotes a `no_result` outcome to `valid`), otherwise the derived values pass through unchanged.

## Placings

`calculatePlacings(results)` ranks effective valid results in ascending time (fastest first) within an event. Athletes with an identical time share a place. Voided outcomes (`dq`/`dnf`/`dns`), uncorrected `no_result` entries, and every result in a cancelled event receive `null`; a `no_result` promoted by an override can rank.

## PB/SB rules

`is_pb` is true when the athlete's effective result is better (lower time) than every previously recorded effective result for the same discipline; `is_sb` is true when it beats the best effective result recorded in the current season. A derived valid result or a `no_result` promoted by an override can count; voided outcomes never set PB/SB. The stored `outcome` and `final_result` remain the raw derivation for auditability while statistics use the override value. Both flags are computed by `checkPbSb`, taking a calendar-year window for the season.

## Implementation status

`backend/src/services/resultDerivation.ts` implements `deriveFieldBest`, `deriveTrackTime` (competition vs training rules), `deriveResult`, `deriveEffectiveResult`, `calculatePlacings` and `checkPbSb` — including DQ/DNF/DNS voiding, penalty retention, soft-delete handling and the derived `outcome`. It is covered by Vitest unit tests (best-valid-field-attempt, competition single-finish and training fastest-rep rules, foul-only attempts, DQ/DNF/DNS voiding, penalty retention, soft-deleted/invalid values, no-result semantics, manual override, tied placings, and PB/SB). Database access utilities (`backend/src/db/row-mappers.ts`, `backend/src/db/transaction.ts`) now exist to feed these functions, and the engine aligns with the `results.outcome` column added by migration `0002_contract_100m.sql`.

## Design note

These rules are deliberately small and pure so they can be unit-tested exhaustively (foul-only attempts, DQ after valid attempts, tied results) and reused by the merge logic in Stage 3, where every synced batch recomputes `results` so all clients converge on the same derived state.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free].
