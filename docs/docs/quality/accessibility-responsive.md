---
sidebar_position: 4
---

# Accessibility and responsive design

Athlora targets WCAG 2.1 Level AA practices for its coach console and public pages. Accessibility is treated as a release-quality concern, not as a visual polish step.

## Implemented practices

| Concern | Implementation |
|---|---|
| Semantic interaction | Native controls and accessible roles are preferred; tests query by role and label. |
| Dialogs | The shared modal traps focus, supports Escape where safe, restores focus to its trigger, and announces busy/error state. |
| Feedback | Loading, success, errors, and live updates use visible text plus status or alert semantics where appropriate. |
| Keyboard use | Session tabs, forms, public pages, and dialogs support keyboard navigation; focus moves predictably after route and mutation changes. |
| Colour | Club primary colours are validated against light and ink backgrounds; information is not conveyed by colour alone. |
| Motion | Landing and console visual effects have reduced-motion and compact-device profiles. Decorative WebGL does not contain required content. |
| Responsive layout | The logger, forms, cards, public schedule, and dialogs reflow for narrow screens. Dialog actions stack and meet touch-target guidance below the compact breakpoint. |

## Verification

- Playwright runs axe-core checks using WCAG 2.0/2.1 A and AA rules on the landing page and key authenticated views.
- The accessibility suite covers dashboard, roster, events, live logger, comparison, account, athlete detail, keyboard navigation, and a 320px no-horizontal-scroll check.
- Component tests use accessible role and label queries; they supplement but do not replace browser audits.
- The authenticated browser suite runs on desktop Chromium and a Pixel 5 profile when its Auth0 secrets are configured.

Automated checks fail on critical or serious axe findings. See [Testing](../testing/overview) for the exact runners, CI gate, and credential limitation.

## Manual release check

Before a significant UI release, verify the affected flow with keyboard only, at a narrow viewport, with reduced motion enabled, and with an error/retry state. For public changes, also verify the page without Auth0 configuration. Automated auditing cannot confirm all screen-reader announcements, task clarity, or real-device touch ergonomics.

## Known boundary

The application has automated accessibility coverage, not a formal third-party accessibility certification. New visualisations and third-party browser behaviour still require manual review when changed.

## AI declaration

This document was created or updated with the assistance of OpenCode[openai/gpt-5.6-terra].
