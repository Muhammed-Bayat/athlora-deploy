---
sidebar_position: 1
---

# Sprint 3 Meeting Records

This document is a concise record of the material planning, delivery, testing, and review discussions from Sprint 3. It is derived from the retained [raw meeting transcript](./raw-meeting-transcript), the [client-meeting record](./client-meetings), and the repository's implementation documentation.

## Sprint Context

- **Delivery focus:** extend Athlora from the 100m vertical slice towards multi-discipline meets, public statistics and schedules, reports, club branding, and richer live-result workflows.
- **Work tracking:** the team coordinated through Gitea issues, delivery rows, pull requests, and the bug tracker.
- **Quality expectation:** complete one focused change at a time, verify it locally and in deployment where possible, and collect stakeholder and user feedback before the Sprint close.

## 15-17 September 2026: Documentation, Release, and Client Review

### Discussed

- The team completed outstanding documentation, including database, API, third-party, methodology, testing, and ERD material before release.
- A documentation build failure was traced to files not being included in a merge request, and the documentation work was reassigned and checked.
- The team prepared and held the Sprint 3 client meeting, then captured the requested product improvements.

### Decisions and Outcomes

- The documentation was updated and a release was created on 15 September.
- Chart colours were identified for refinement so distinct athletes could be read clearly.
- The 17 September client review set the Sprint's follow-up direction: downloadable/public statistics, multi-discipline support, official result selection, places, club branding, privacy controls, and dashboard personalisation.

### Evidence from the Raw Transcript

- **15 September, 10:02, Vikram Mahalingam:** identified that the documentation build failed because the new documentation files were missing from the merge request.
- **15 September, 10:52, Vikram Mahalingam:** reported that the documentation had been updated and the release created.
- **15 September, 16:09, Aaliah Reddy:** recorded the need for more distinct chart colours for each athlete.
- **16 September, 12:38, Vareshan Rajah:** confirmed the client meeting arrangement for 17 September.
- **17 September, 13:10, Aaliah Reddy:** retained the client-review notes that form the basis of the [Sprint 3 Client Meetings](./client-meetings) record.

## 20-24 September 2026: Issue Planning and Delivery Rows

### Discussed

- The team converted the client-review follow-up work into issues and chose to avoid broad, unverified automated changes after earlier rework.
- Work was divided into delivery rows, with contributors reporting completion before dependent rows began.
- The team discussed dashboard customisation, public reports and leaderboards, performance, media storage, automated testing, and expanded feedback collection.

### Decisions and Outcomes

- Contributors were asked to claim work explicitly, read the issue context, and work through focused changes.
- Rows 1 through 5 progressed in order, with work shared across the team and type-check failures fixed before moving on.
- The team planned refreshed Sprint 3 stakeholder and user feedback forms and agreed to gather broader testing evidence before the close.
- Club-logo storage was recognised as requiring an object-storage integration rather than direct database storage.

### Evidence from the Raw Transcript

- **20 September, 11:42-11:53, Aaliah Reddy and Muhammed Bayat:** recorded the request to create issues and the decision to avoid repeating unverified bulk changes.
- **22 September, 20:10-22:35, Muhammed Bayat, Aaliah Reddy, and Vikram Mahalingam:** recorded row allocation, a Friday delivery target, and completion of row 1.
- **23 September, 16:15, Vikram Mahalingam:** reported row 2 complete and identified dashboard-customisation presentation as a later refinement.
- **24 September, 07:31-17:59, Tyra, Muhammed Bayat, and Vikram Mahalingam:** recorded type-check repairs, row 4 completion, and the start of rows 5 through 7.
- **24 September, 19:05-19:12, Aaliah Reddy, Muhammed Bayat, Vareshan Rajah, and Vikram Mahalingam:** discussed performance, expanded user testing, feedback-form questions, and the planned coverage target.

## 25-26 September 2026: Stabilisation and Product-Flow Testing

### Discussed

- The team tested event creation, live logging, reports, public surfaces, athlete disciplines, dashboard controls, and club branding while completing the remaining rows.
- Gitea actions and the deployment mirror intermittently failed to trigger, even when local `main` contained the expected changes.
- The team identified broken or incomplete flows and created focused fixes rather than treating the full feature list as complete.

### Decisions and Outcomes

- Event-creation and report issues were prioritised because they blocked validation of the new public/reporting workflows.
- Gitea/deployment instability was treated as an external integration problem while local state was checked before further changes.
- The team prepared the Sprint 3 forms on 25 September and continued validation of the multi-discipline, live-logger, reports, leaderboard, and athlete-discipline experiences.
- Credentials required for local setup were removed from the published transcript and evidence archive.

### Evidence from the Raw Transcript

- **25 September, 12:14-12:22, Aaliah Reddy and Muhammed Bayat:** recorded event-start and report-testing failures, followed by a focused repair.
- **25 September, 12:54-14:23, Vareshan Rajah, Vikram Mahalingam, Aaliah Reddy, and Muhammed Bayat:** recorded the Gitea/mirror and action-triggering problems while confirming that work was present on `main` locally.
- **25 September, 14:22, Aaliah Reddy:** reported that the Sprint 3 forms had been created.
- **26 September, 12:20, Muhammed Bayat:** listed the public-schedule, navigation, reports, leaderboard, dashboard, and athlete-discipline issues found during testing.
- **26 September, 13:04:** the raw transcript records a local-environment problem; its credential-bearing content and attachment are redacted from the published evidence.

## 27 September 2026: Public Statistics, Leaderboards, and Feedback Collection

### Discussed

- The team repaired event and sign-in flows, tested public and authenticated reports, and refined the navigation between public statistics and schedules.
- The team discussed leaderboard behaviour and the distinction between valid zero results, unfinalised sessions, and failed data loading.
- Stakeholder and user feedback collection was actively followed up while live-logger and assistant-role issues were checked.

### Decisions and Outcomes

- Athlete and club leaderboard surfaces were implemented, with official/finalised results retained as the appropriate scoring source.
- The team agreed to keep fixes focused and to inspect actual user flows rather than applying vague issue text without verification.
- Harshil completed the Sprint 3 stakeholder-feedback form; user feedback continued to be collected.

### Evidence from the Raw Transcript

- **27 September, 00:43, Vareshan Rajah:** reported that sign-in and event flows were working after repairs.
- **27 September, 16:10-16:16, Muhammed Bayat and Aaliah Reddy:** clarified that public-surface navigation should allow movement between all landing-page destinations.
- **27 September, 17:17, Aaliah Reddy:** reported completion of athlete and club leaderboard surfaces.
- **27 September, 17:25:** the transcript retains the proposed official-result and legacy-result handling plan for standings.
- **27 September, 22:25, Vareshan Rajah:** reported that Harshil had completed the stakeholder-feedback form.

## 28 September 2026: Final Validation, Release Preparation, and Presentation Planning

### Discussed

- The team checked deployments, result publication after event completion, offline logging, AI discipline selection, dashboard content, club branding, and user-feedback response counts.
- Multi-discipline public logging was tested by starting individual discipline sessions, selecting official results, and checking athlete visibility and undo behaviour.
- The group discussed what could be safely completed for the Sprint versus what should remain next-Sprint work, including object storage and some presentation refinements.
- The team began planning a presentation combining a live demonstration with recorded walkthrough material.

### Decisions and Outcomes

- The team enabled an available runner while deployment checks completed and verified core event, statistics, and offline-logger flows.
- Dashboard customisation and saved views were removed as unnecessary clutter; the remaining dashboard scope focused on athlete PBs and upcoming events.
- The DQ/DNF/DNS undo path was repaired and merged, while club media storage was deferred because the S3-compatible bucket was not configured.
- The team retained the distinction between a basic working offline logger and later usability improvements, rather than overstating unverified relay or branding behaviour.

### Evidence from the Raw Transcript

- **28 September, 09:31-09:35, Muhammed Bayat and Vikram Mahalingam:** recorded enabling an available runner for deployment work.
- **28 September, 11:32-11:35, Muhammed Bayat and Aaliah Reddy:** listed final checks for event completion, statistics, and offline logging.
- **28 September, 14:49-15:04, Aaliah Reddy, Muhammed Bayat, and Vareshan Rajah:** recorded multi-discipline public-logger testing, session-start behaviour, official-result selection, and undo defects.
- **28 September, 15:16-15:23, Aaliah Reddy and Vikram Mahalingam:** recorded that club-logo uploads failed because object storage was not configured and should be deferred.
- **28 September, 16:19-17:12, Aaliah Reddy and Vikram Mahalingam:** agreed to simplify the dashboard and preserve only useful roster and upcoming-event information.
- **28 September, 19:00-19:16, Muhammed Bayat:** reported the undo repair and its merge.
- **28 September, 19:19-19:26, Aaliah Reddy, Vareshan Rajah, Muhammed Bayat, and Vikram Mahalingam:** discussed combining a live demonstration with presentation material for the final delivery.

## Improvement for the Next Sprint

Prioritise end-to-end validation of one complete workflow at a time before expanding scope. Keep secrets out of chat exports and documentation, verify deployments separately from local state, and defer non-critical features such as media storage until their service configuration is available.

## AI Declaration

This document was synthesized from supplied project-chat evidence and client-meeting notes with the assistance of OpenCode[openai/gpt-5.6-terra].
