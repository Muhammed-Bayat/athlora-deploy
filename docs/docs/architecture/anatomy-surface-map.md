---
sidebar_position: 2
---

# Anatomical Surface Map

The Fitness viewer renders injuries from a topology-bound vertex map, not world-space positions, decals, overlays, or camera-dependent logic.

## Verified Asset

`frontend/public/models/athlora-anatomy.glb` and `athlora-anatomy-map-v2.json` are a matched pair.

| Property | Value |
| --- | --- |
| Mesh | `model` |
| Position vertices | 79,534 |
| Triangles | 120,000 |
| SHA-256 | `cae88c05d2b6aaff2840faf80d177f53e78210010a31fae864233d0a6dadd212` |
| Local axes | `+Y` up, `+Z` front, `+X` anatomical left |

The map contains a region ID and a topology-aware core weight for every position vertex. Geometry must be cloned before attributes are attached, and the viewer stops with an error if the position count is not exactly 79,534. Do not call `toNonIndexed()`, merge vertices, simplify, remesh, or otherwise reorder the source geometry.

## Runtime Flow

1. `BodyViewer` loads the exact GLB and the JSON map.
2. It clones mesh `model`, validates its topology, and adds anatomy-region, core-weight, injury-colour, and injury-strength attributes.
3. Saved injuries and the unsaved form preview resolve through the map's `uiMappings` table.
4. The highest-severity injury for each region supplies its colour; the precomputed core weight fades that colour smoothly into the neutral translucent cyan surface.
5. The material shader blends only those per-vertex attributes, so heat remains fixed to the same anatomical surface while the model rotates.

The preview uses the same mapping and a reduced intensity. It is removed when the editor is cleared or saved.

## Region Semantics

Head/neck and torso areas use the map's centre regions, so the editor does not expose a left/right control for them. Arms and legs resolve left, right, or both through the map's supplied UI entries. The normal application does not render the debug palette; development mode includes a selector for inspecting one mapped region at a time.

## Visual QA

Verify the following from front, side, and back views:

- `Torso -> Abdomen / core -> Severe`: abdomen only.
- `Arm -> Forearm -> Both -> Severe`: forearms only.
- `Arm -> Hand -> Both -> Severe`: hands only.
- `Leg -> Knee -> Both -> Severe`: compact knee regions only.
- `Arm -> Shoulder -> Left -> Moderate`: left shoulder cap only.
