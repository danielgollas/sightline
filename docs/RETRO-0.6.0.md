# Retro — frustum solids into the scene (0.6.0)

Driving the built page in a real browser, running the ordinary flows, and
writing down what was actually wrong before changing anything.

## What was asked

Move the frustum solids out of the SVG overlay and into the WebGL scene, with
shading that makes them readable as volumes. Then use the app and fix what is
broken.

## What the move fixed

Frustum solids were the last ray-cast overlay still painted on top of the
render. Like the splatter before them in 0.5.0, they had no depth buffer, so a
cone pointing away through the house was drawn over the wall that blocks it.
They were also expensive enough as SVG that they had to vanish while you
orbited — the one moment you most want to see the shape of a volume.

They are now triangles in the scene, drawn after the opaque pass against the
same depth buffer, and they stay put while the view moves.

## Four things that were wrong, and how each was found

Every one of these came from looking at the screen, not from reading the code.

### 1. Additive blending turned every volume grey

The first shading attempt was additive, chosen because additive is
order-independent and the triangles interpenetrate so they cannot be sorted.
On screen every camera's volume came out the same pale grey.

The cause is headroom. The destination is a daylit scene — sky at roughly
(0.61, 0.77, 0.89) — and adding any colour to something already that bright
moves it toward white, taking the hue with it. Camera identity is the entire
reason the volumes are coloured.

Replaced with premultiplied `ONE, ONE_MINUS_SRC_ALPHA`, which interpolates
toward the layer's own colour instead of adding light. The order-dependence I
had been avoiding turned out to be a non-issue: draw order is buffer order, so
it is fixed across frames and cannot flicker as the view turns.

The fragment shader now emits premultiplied colour on every path. On the opaque
pass alpha is 1, so that is the colour unchanged.

### 2. The volumes were nearly invisible

`buildFrusta` alphas (0.16, and 0.055 for the walls) were tuned for an SVG
painter stacking a dozen polygons. With a depth buffer you see about two
layers, so the same numbers produced almost nothing — and a Fresnel term whose
floor was 0.22 was *reducing* the body to about 0.035.

### 3. The volume rendered as a fan of blades — measured, not guessed

This was the interesting one, and my first two hypotheses were both wrong.

- *Hypothesis: coarse tessellation.* Raised `NA` from `max(6, fov/12)` to
  `max(12, fov/7)` and `NV` from 5 to 10. No change.
- *Hypothesis: the Fresnel term blazing on the walls.* Softened it. No change.

So I stopped guessing and ablated live in the page: dropped every quad
touching the apex, leaving only the far cap. **The blades survived** — so they
were cap geometry, not walls, not shading. Splitting the cap by height showed
67 of 130 quads had corners well above ground, up to 6.9 ft. Disabling the
fence changed almost nothing (60 still elevated), so it was the porch and its
posts.

The root cause: **the cap grid straddles an occlusion discontinuity.** One ray
clears a porch post at 6 ft and its neighbour is stopped by it at 55 ft. The
quad between them is drawn as a solid sheet from the post to the far lawn. A
grid over (azimuth, elevation) simply cannot represent that crease, and the
smeared sheets are the blades.

Fixed where the problem is: a quad whose corner ranges disagree badly is faded
out, so the cone visibly stops at the obstruction rather than smearing past it.
The first cut at this was too aggressive — it dissolved the volume around every
tree, which is exactly where you are looking — and was relaxed to remove only
quads whose corners differ by more than about 8×.

Fresnel stayed, but gentle. Depth is carried instead by how many layers a ray
crosses, which is what depth actually is.

### 4. `castRay3` had its own copy of the occlusion test

Found while adding a tree to check the fix. `frusta.js` carried a private
`insideBox()` that tested an axis-aligned box: it ignored `yaw` entirely and
treated a cylinder or a tree canopy as its bounding box. The drawn volume
therefore disagreed with the coverage percentage sitting beside it, for exactly
the occluders the transform work added.

This is the hazard the developer guide names — a second, hand-maintained copy
of the intersection maths — and it had quietly grown back. `castRay3` now goes
through `insideOccluder()`, the same test `blocked()` and the splatter use.

## Also broken, found by using the app

**The opening view did not frame the scene.** `VIEW` is a fixed 100×88 ft box
and the app boots a measured lot 199 ft across, so the plan opened cropped with
the boundary off screen in three directions, and the 3D orbit — hard-coded to
95 ft back from (12.5, 12.5) — opened as a close-up of one wall. Both now frame
the property they actually loaded. This was not new, but it is the first thing
anyone sees.

**Round occluders had a smudge for handles.** A selected tree or column drew
four edge handles into a footprint two feet wide, stacking them into one black
blob with N/E/S/W printed on top of each other. Round shapes are described by a
centre and a radius, so they now get the centre handle only.

## Verification

56 checks against the real page, up from 49. The five new ones pin the things
this release could silently lose:

- frustum solids are uploaded as GL geometry, and clear when switched off
- they add no SVG polygons over the render
- no quad smears across an occlusion edge (worst corner ratio 7.0×)
- a tree canopy clips the frustum cast — 17 ft against 66 ft unobstructed,
  which fails if `castRay3` ever grows its own box test again
- the plan opens with the whole property on screen, filling 91% of the stage

## What I would flag

The plan view is still busy when splatter and vector cones are both on: the
cones are opaque enough to hide the render they sit over, which works against
the plan being a render at all. Nothing is wrong; it is a legibility judgement
and I left it alone rather than change a default you may have chosen.
