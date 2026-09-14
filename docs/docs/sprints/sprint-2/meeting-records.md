---
sidebar_position: 1
---

# Sprint 2 Meeting Records

This document is a concise record of the material planning, delivery, testing, and review discussions from Sprint 2. It is derived from the retained [raw meeting transcript](./raw-meeting-transcript), the client-meeting record, and the repository's implementation documentation.

## Sprint Context

- **Delivery focus:** extend the 100m coaching workflow with connected-club, fixture, offline, comparison, public-logger, and quality-assurance work.
- **Work tracking:** the team used the Gitea issue board, pull requests, waves of related issues, and a bug tracker to coordinate work and fixes.
- **Quality expectation:** changes were checked locally and through CI where possible before release; user and stakeholder feedback was collected through separate forms.

## 25-26 August 2026: Scope and Delivery Waves

### Discussed

- The team considered whether to expand immediately beyond the 100m workflow or first polish the existing vertical slice.
- The team selected the simpler account/athlete model shown in the shared options and considered a read-only QR-code event view as a later enhancement.
- Work was organised into issue waves, with reminders to create pull requests, assign work, and obtain review.

### Decisions and Outcomes

- The 100m workflow remained the delivery foundation while the wider athletics model was considered for later extension.
- Wave 1 and Wave 2 were reported complete on 26 August, allowing subsequent work to continue.
- The team reaffirmed that issue assignment and pull-request review were part of the delivery process.

### Evidence from the Raw Transcript

- **25 August, 17:45, Muhammed Bayat:** proposed polishing 100m before applying changes across additional disciplines.
- **25 August, 18:52, Muhammed Bayat:** reminded contributors to read the relevant issue, push a pull request, and obtain review.
- **26 August, 11:45, Muhammed Bayat:** recorded that Wave 2 was complete.

## 29 August-1 September 2026: Integration, Coverage, and Wave Progress

### Discussed

- The team reported Wave 3 through Wave 6 progress while resolving repository mirror, branch, deployment, Auth0, and merge-conflict problems.
- Contributors were asked to re-clone local repositories after a mirror problem and to keep completed branches and pull requests manageable.
- The team reviewed coverage reporting after determining that Codecov could not be integrated with the Gitea setup.

### Decisions and Outcomes

- The team used a repository coverage report and a 70% quality threshold rather than Codecov.
- Branch-update and merge-conflict guidance was shared during Wave 5 and Wave 6 integration.
- The team continued to track production-only issues separately from local verification.

### Evidence from the Raw Transcript

- **29 August, 17:59, Muhammed Bayat:** asked contributors to re-clone repositories to prevent the mirror from breaking again.
- **30 August, 19:16, Vikram Mahalingam:** explained that a branch should be updated from `main` before resolving its merge conflict.
- **1 September, 14:05, Aaliah Reddy:** recorded the coverage-report approach and the 70% threshold.

## 2 September 2026: Testing and Review Preparation

### Discussed

- The team coordinated the remaining implementation waves, UI fixes, and a known progression-chart E2E failure.
- Separate stakeholder and user feedback forms were prepared for review after the Sprint build was ready.
- The group selected a bug-tracker approach and identified the need for testing documentation.

### Decisions and Outcomes

- Progression-chart and UI issues were recorded for repair before and after the stakeholder demonstration.
- Feedback collection was separated into stakeholder and general-user forms.
- Test timeout failures were resolved and merged that evening.

### Evidence

![Bug tracker options discussed by the team](./screenshots/00003141-PHOTO-2026-09-02-18-21-14.jpg)

### Evidence from the Raw Transcript

- **2 September, 14:23, Aaliah Reddy:** identified the progression charts as unavailable because of an E2E failure.
- **2 September, 18:09-18:39, Aaliah Reddy and Vikram Mahalingam:** recorded the separate feedback forms, bug-tracker discussion, and planned release timing.
- **2 September, 22:54, Vikram Mahalingam:** reported that the test timeout issue had been resolved and merged.

## 3-4 September 2026: Client Review and Immediate Fixes

### Discussed

- The team demonstrated the current version to the client and captured usability, reliability, documentation, and deployment feedback.
- The priority defects included light-theme colours, the injury visual on athlete tiles, progression charts, live weather, and navigation controls.
- Additional reports covered comparison errors, injury persistence, venue selection, fixtures, the public logger, and slow-loading states.

### Decisions and Outcomes

- The feedback was entered into the bug tracker and allocated between progression/comparison work and UI work.
- The progression charts were reported working after repair on 3 September.
- The team continued to distinguish deployed behaviour from local behaviour while investigating weather and fixture issues.

### Evidence from the Raw Transcript

- **3 September, 13:48-13:54, Aaliah Reddy:** recorded the client meeting, its requested documentation, and the priority bug list.
- **3 September, 17:17, Aaliah Reddy:** reported that bugs had been added to the tracker.
- **3 September, 19:54, Aaliah Reddy:** reported that progression charts had been repaired.

## 5-8 September 2026: Connected Coaching and Release Readiness

### Discussed

- The team completed and tested fixture invitations, club onboarding, public logger access, UI fixes, notifications, privacy/terms work, comparisons, and offline logging.
- Production, type-check, test, dashboard, weather, RSVP, and invitation issues were repeatedly identified and triaged.
- The team agreed to release the build and collect feedback while retaining a backlog for non-critical fixes.

### Decisions and Outcomes

- Release `0.3.0` was selected using the documented pre-1.0 semantic-versioning convention.
- Stakeholder and user feedback forms were distributed on 8 September.
- The team agreed to defer larger invitation-model decisions until further client feedback rather than removing functionality without review.
- Public logger corrections were limited to the originating official's own entries, while coaches retained broader authority.

### Evidence

[Sprint 2 user testing and feedback export](./screenshots/00004003-Athlora%20%E2%80%94%20Sprint%202%20User%20Testing%20%26%20Feedback.pdf)

### Evidence from the Raw Transcript

- **7 September, 22:28, Vikram Mahalingam:** reported that the production deployment was available after the frontend type check passed.
- **8 September, 09:25-09:27, Aaliah Reddy, Vareshan Rajah, and Muhammed Bayat:** agreed on `0.3.0` and the follow-on pre-1.0 versioning approach.
- **8 September, 09:50-09:55, Aaliah Reddy and Vareshan Rajah:** recorded that the feedback forms were ready to distribute to the stakeholder.
- **8 September, 21:10, Vareshan Rajah:** recommended obtaining client input before changing the invitation model.

## 9-14 September 2026: Stabilisation and Sprint Close

### Discussed

- The team completed live-logger fixes, comparison/public-statistics work, notification changes, seasonal-statistics work, and offline logging verification.
- User-testing responses and stakeholder feedback were collected, with Sprint evidence to be added alongside the automated-testing documentation.
- Weather reliability remained a concern until the provider migration was completed.

### Decisions and Outcomes

- Live-logger issues were reported fixed and closed on 9 September.
- The team added club and athlete comparison capability, including client-controlled public statistics.
- Offline logging was verified with an online QR-code start, offline entry, and reconnect-and-sync flow.
- Weather was migrated to GraySky on 14 September.

### Evidence from the Raw Transcript

- **9 September, 20:23, Muhammed Bayat:** reported that live-logger work was complete and its issues were recorded and closed.
- **10 September, 23:53, Vareshan Rajah:** reported that comparison work and public viewing of published club statistics were complete.
- **13 September, 18:40, Vikram Mahalingam:** described the offline logger verification flow.
- **14 September, 04:54, Vareshan Rajah:** reported that weather had been migrated to GraySky.

## Improvement for the Next Sprint

Keep the bug tracker current with reproducible descriptions and affected environment, then verify the relevant local, production, and automated-test paths before release. This addresses the repeated local-versus-deployed discrepancies and regression cycles recorded during Sprint 2.

## AI Declaration

This document was synthesized from supplied project-chat evidence with the assistance of OpenCode[openai/gpt-5.6-terra].
