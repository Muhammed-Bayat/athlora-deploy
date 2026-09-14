---
sidebar_position: 3
---

# Sprint 2 User Stories & Acceptance Criteria

This document defines the user stories, acceptance criteria, and User Acceptance Tests (UATs) for **Athlora** Sprint 2. It builds on the foundation established in Sprint 1 and introduces event results retrieval, transactional result recomputation, and per-athlete result recalculation on timeline mutations.

---

## Summary of User Stories

| ID | Title | Priority | Target Component / Module |
|---|---|---|---|
| **US-001** | Event Results Retrieval via API | High | Results API (`/events/:eventId/results`) |
| **US-002** | Transactional Event-Level Result Recomputation | High | `resultRecomputation.ts`, Event Lifecycle |
| **US-003** | Transactional Per-Athlete Result Recomputation on Timeline Mutations | High | `timeline.ts`, `resultRecomputation.ts` |

---

## Detailed User Stories

### US-001: Event Results Retrieval via API
- **Priority:** High
- **User Story:** As a coach, I want to retrieve the computed results for a specific event via a dedicated API endpoint, so that I can view each athlete's outcome, final time, placing, PB/SB flags, and any manual overrides in a structured format.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an event with derived results, **When** I request `GET /events/:eventId/results`, **Then** the API returns a list of all result rows for that event, each containing `outcome`, `finalResult`, `unit`, `placing`, `isPb`, `isSb`, and manual override fields.
2. **Given** an event where no timeline entries have been logged, **When** I request results, **Then** an empty list is returned with `count: 0`.
3. **Given** a result with a manual override applied, **When** the result is retrieved, **Then** the `manualOverride`, `overrideReason`, `overriddenBy`, and `overrideAt` fields reflect the override audit trail.

#### User Acceptance Tests (UAT)
- **UAT-001.1:** Log timeline entries for two athletes in an event, then call `GET /events/:eventId/results`. Verify both result rows are returned with correct `outcome`, `finalResult`, and `placing` values.
- **UAT-001.2:** Request results for an event with no logged entries. Verify the response is an empty list with `meta.count` of `0`.
- **UAT-001.3:** Apply a manual override to an athlete's result, then retrieve results via the endpoint. Verify `manualOverride`, `overrideReason`, `overriddenBy`, and `overrideAt` are populated correctly.

---

### US-002: Transactional Event-Level Result Recomputation
- **Priority:** High
- **User Story:** As a coach, I want event results to be automatically and atomically recomputed whenever I update an event's type, date, time, or status, so that derived placings, PB/SB flags, and outcome values always remain consistent with the current event configuration.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an event with existing results, **When** I update the event type (e.g. from `training` to `competition`) via `PUT /events/:id`, **Then** all results for that event are recomputed within the same transaction — placings are assigned for competition events and cleared for training events.
2. **Given** an event with existing results, **When** I cancel the event (`DELETE /events/:id`), **Then** all result placings are set to `null` and PB/SB flags are recalculated across affected athletes' histories within the same transaction.
3. **Given** an event update that changes the event date, **When** results are recomputed, **Then** PB/SB comparisons use the new event date against the athlete's historical results.

#### User Acceptance Tests (UAT)
- **UAT-002.1:** Create a training event, log timeline entries, then update the event type to `competition`. Verify that placings are assigned to all valid results after the update.
- **UAT-002.2:** Create a competition event with results and placings, then cancel the event. Verify all placings are set to `null` and PB/SB flags are recalculated.
- **UAT-002.3:** Create an event with a future date, log results (setting a PB), then update the event date to a past date. Verify PB/SB flags are recomputed using the new date against historical records.

---

### US-003: Transactional Per-Athlete Result Recomputation on Timeline Mutations
- **Priority:** High
- **User Story:** As a coach, I want each timeline entry creation, correction, or undo to trigger an atomic recomputation of that athlete's result — including re-deriving the outcome, recalculating event-wide placings, and updating PB/SB flags — so that results are always immediately consistent with the latest timeline data.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an `in_progress` competition event, **When** I create a new timeline entry for an athlete (`POST /events/:eventId/entries`), **Then** the athlete's result is recomputed: the outcome and final time are re-derived, placings across all athletes in the event are recalculated, and PB/SB flags are updated — all within a single transaction.
2. **Given** an existing timeline entry, **When** I correct it via `PATCH` with the correct `expectedVersion`, **Then** the athlete's result and event-wide placings are atomically recomputed to reflect the corrected value.
3. **Given** a timeline entry that has been soft-deleted (undone), **When** the undo is processed, **Then** the athlete's result is recomputed excluding the deleted entry, and event-wide placings and PB/SB flags are updated atomically.
4. **Given** a training event, **When** timeline entries are created or modified, **Then** result placings are set to `null` for all athletes in the event (training events do not assign placings).

#### User Acceptance Tests (UAT)
- **UAT-003.1:** In a competition event with two athletes who have existing results, log a new faster attempt for one athlete. Verify that the athlete's result is updated, placings are recalculated for all athletes, and PB/SB flags reflect the new time.
- **UAT-003.2:** Correct a timeline entry to a slower time using `PATCH` with the correct `expectedVersion`. Verify that the result and all athlete placings in the event are updated accordingly.
- **UAT-003.3:** Undo (soft-delete) a timeline entry that was the basis of an athlete's result. Verify the result reverts to the next-best entry (or `no_result`), placings are recalculated, and PB/SB flags are updated.
- **UAT-003.4:** In a training event, create a timeline entry and verify the result is derived but all placings in the event are `null`.

---

## AI Usage Declaration

This document was generated and refined with the assistance of AI tools:
- **Code Generation & Documentation Synthesis:** `opencode[mimo-v2.5-free]`
- **In-line Review & Structuring:** `opencode[mimo-v2.5-free]`
