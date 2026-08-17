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

The statistics and dashboard services repeat the same effective-result precedence in owner-scoped SQL: DQ/DNF/DNS remain void before an override is considered, then a positive override may replace a valid value or promote `no_result`. Athlete history retains cancelled rows with `countsTowardsStatistics: false`; PB, SB, counts, roster PBs and dashboard recent feeds exclude cancelled events.

## Implementation status

`backend/src/services/resultDerivation.ts` implements the pure derivation/effective-result/placing/PB-SB rules. Timeline and override mutations now share canonical whole-event recomputation so raw result fields remain auditable while downstream effective metadata converges. `backend/src/services/statistics.ts` and `dashboard.ts` expose the same semantics through tested aggregates, and `backend/src/db/transaction.ts` supplies a repeatable-read, read-only snapshot for multi-query responses.

## Design note

These rules are deliberately small and pure so they can be unit-tested exhaustively (foul-only attempts, DQ after valid attempts, tied results) and reused by the merge logic in Stage 3, where every synced batch recomputes `results` so all clients converge on the same derived state.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and maintained with opencode[gpt-5.6-sol].
