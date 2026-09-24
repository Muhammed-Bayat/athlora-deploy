# High Jump and Pole Vault

Vertical sessions use metres (two decimal places) and highest clearance wins.
Catalogue defaults are three consecutive failures, 0.02 m High Jump / 0.05 m
Pole Vault increments, and a final round. These increments are the standard
minimum increases; coaches can configure a different constant progression.
There is no universal senior starting height: the organiser must supply it.
Qualification and final are separate sessions with independent histories.

## History and elimination

Each entry records a target height, server-assigned order, state, session,
entrant and workspace. Existing actor/version/audit records preserve corrections.
O means clearance, X failure, – pass, and void means an annulled entry.
Pass closes the athlete's remaining attempts at that height; later heights may
be skipped. Heights never decrease. Clearing closes a height and resets the
consecutive-failure count. Passing or advancing the bar does not reset it.
Three consecutive failures (or the configured limit) eliminate the athlete,
even across multiple heights. Voids do not count as failures or clearances.
Corrections replay the whole history and reject a newly impossible sequence.
An official unsuccessful attempt must be logged as failure, not void.

The result is always the highest valid clearance. No clearance is `no_result`
(displayed as NH), never zero metres. DQ and DNS invalidate the result. An
athlete stopping after a clearance retains that clearance; DNF is not used.
Completion freezes logging. Only completed sessions contribute to statistics.

## Countback and ties

1. Highest cleared height, descending.
2. Fewest unsuccessful attempts at that highest cleared height.
3. Fewest unsuccessful attempts at all heights **up to and including** the
   highest cleared height. Failures above the best clearance are excluded.
4. Equal sporting keys share a place, using competition ranking (1, 1, 3).

Passes and void entries never enter countback. IDs, names and insertion order
cannot decide sporting placing. This release uses the permitted no-jump-off
policy, including shared first place; it does not claim to conduct a jump-off.
PB/SB compare height only, within the same discipline, not countback keys.
