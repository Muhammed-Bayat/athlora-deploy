# Workspace squads

Issue #87 replaces the legacy `athletes.squad` text tag with workspace-scoped `squads` and `athlete_squads` memberships. The legacy column is retained only so existing deployments can migrate safely; application queries must not read or write it.

Migration `0007_workspace_squads.sql` creates one managed squad for every distinct trimmed nonblank legacy value in each workspace and creates its athlete membership. Names are unique case-insensitively within a workspace. Squad removal is archival, so memberships and historical event/result records remain intact.

Athlete create and replacement requests use `squadIds: string[]`; every ID is validated against the active workspace. Athlete responses provide `squads`, while aggregate and participant responses provide `squadNames`. Membership filters use `squadId` and SQL `EXISTS`, and summary projections aggregate squad names in scalar subqueries to avoid multiplying athletes or results.

## AI declaration

This document was generated and edited with the assistance of opencode[openai/gpt-5.6-terra].
