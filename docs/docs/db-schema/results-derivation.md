---
sidebar_position: 2
---

# Result derivation rules

`results` are never typed in by hand — they are derived from `timeline_entries`. The derivation logic lives as pure functions in `backend/src/services/resultDerivation.ts`, unit-tested with Vitest. Every derivation returns `{ value, incident, outcome }`, where `outcome` is `no_result` | `valid` | `dq` | `dnf` | `dns`.

The deployed derivation implementation is fixed to **100m** (track, timed) with unit **seconds** at the API/service boundary — see the [100m data/API contract](/docs/api-reference/contract). `DISCIPLINE_KIND` currently maps `'100m'` → `'track'`. Athlora is intended to cover a full athletics meet; each further discipline will add tested derivation and ranking rules rather than reusing sprint timing where it does not apply.

## Timed disciplines (track)

Recording a track event produces time values in seconds. The finishing time follows the 100m sprint timing rules in `deriveTrackTime(entries, eventType)` — the event type decides how the time is read from the active attempts:

- **Competition** (`eventType = 'competition'`, the default): a single active finish. The finishing time is the **latest** valid `attempt` in the timeline (the final time, recorded after any splits), unless a coach has selected a different attempt as the official entry for that session result.
- **Training** (`eventType = 'training'`): the finishing time is the **fastest** (lowest) valid positive `attempt` — the quickest rep is the one that counts.
- **Selected official entry:** for multi-discipline session results (`session_results.selected_entry_id`), `deriveTrackTime` prefers the selected non-deleted attempt when it is present and still valid. Clearing the selection or deleting the selected entry falls back to the competition/training rule above. Selection is coach-only, version-checked, and audited (`entry_selected` / `entry_selection_cleared`).

```ts
deriveTrackTime(entries, eventType = 'competition', selectedEntryId = null)  // → { value, incident, outcome }
```

- Only `attempt` entries count; soft-deleted entries (`deletedAt` set) and zero/negative/non-finite values are ignored.
- A valid finish → `{ value, incident: null, outcome: 'valid' }`.
- `dq` / `dnf` / `dns` incidents void the result: `{ value: null, incident, outcome: <same> }`.
- No valid attempt (or no attempts) → `{ value: null, incident: null, outcome: 'no_result' }`.
- `false_start` and `lane_infringement` are penalty incidents and do not void the result — a `dq` entry must be recorded to void it. Fouls do not apply to track.

## Measured disciplines (field)

Measured field sessions record distance or height attempts in metres. A coach selects one active legal attempt as the official result through `session_results.selected_entry_id`; no selection is a `no_result`, and editing, undoing, fouling, or otherwise invalidating the selected attempt clears it for coach review. The selected mark, not the automatic best, is the authoritative result and is required before the session can be finalized.

- A legal selected attempt is a non-deleted, positive `attempt` with no foul or incident.
- Foul attempts, soft-deleted entries, non-positive values, and incidents cannot be selected.
- `dq` / `dnf` / `dns` void the result even when an official mark is selected. If more than one voiding incident is active, precedence is DQ, then DNF, then DNS.
- Equal selected marks use the remaining legal-attempt series as a field-event countback.

## Vertical disciplines

High jump and pole vault derive a result from the complete ordered sequence of clearance, failure, pass, and void attempts, including countback. A coach makes that complete derived result set official by finalizing the session; no individual attempt can be selected. Reopening the session clears final places and permits corrections before it is made official again.

## Overrides

Coaches can correct a derived result with `manual_override`, `override_reason`, `overridden_by`, and `override_at` — an audit trail of who corrected what, when, and why. Overrides are stored alongside, not instead of, the derived values. `deriveEffectiveResult(derived, manualOverride)` computes the effective result: when a positive override is present its value replaces the derived value (and promotes a `no_result` outcome to `valid`), otherwise the derived values pass through unchanged.

## Placings

Timed sessions rank valid official results in ascending time; measured sessions rank valid official results in descending mark order, with their legal series as the tie-break. Equal results share a place and the next place follows standard competition ranking (for example, 1, 1, 3). Voided outcomes (`dq`/`dnf`/`dns`), uncorrected `no_result` entries, and every result in a cancelled event receive `null`. Vertical sessions apply their documented clearance and countback rules.

## PB/SB rules

For the deployed 100m contract, `is_pb` is true when the athlete's effective result is lower than every previously recorded effective result for the same discipline; `is_sb` is true when it beats the best effective result recorded in the current season. A derived valid result or a `no_result` promoted by an override can count; voided outcomes never set PB/SB. The stored `outcome` and `final_result` remain the raw derivation for auditability while statistics use the override value. Both flags are computed by `checkPbSb`, taking a calendar-year window for the season. Measured-event contracts will use higher-is-better comparisons instead.

The statistics and dashboard services repeat the same effective-result precedence in owner-scoped SQL: DQ/DNF/DNS remain void before an override is considered, then a positive override may replace a valid value or promote `no_result`. Athlete history retains cancelled rows with `countsTowardsStatistics: false`; PB, SB, counts, roster PBs and dashboard recent feeds exclude cancelled events.

## Implementation status

`backend/src/services/resultDerivation.ts`, `measuredDerivation.ts`, and `verticalScoring.ts` implement timed, measured, and vertical session rules. Timeline mutations share canonical per-result recomputation so source history remains auditable while downstream effective metadata converges.

## Design note

These rules are deliberately small and pure so they can be unit-tested exhaustively (foul-only attempts, DQ after valid attempts, tied results) and reused by the merge logic in Stage 3, where every synced batch recomputes `results` so all clients converge on the same derived state.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra]. The selected official-entry derivation rule for multi-discipline session results was documented with the assistance of opencode[mimo-v2.6-flash-free]. Measured-field official selection and vertical result officialization were documented with the assistance of OpenCode[gpt-5.6-terra].
