# Changelog

## 0.6.0

### Frustum solids are in the scene, not over it
The last ray-cast overlay painted on top of the render. With no depth buffer a
cone pointing away through the house was drawn over the wall that blocks it,
and the solids were expensive enough as SVG that they had to disappear while
you orbited - the one moment you most want to see the shape of a volume. They
are now triangles drawn against the same depth buffer as everything else, and
they stay put while the view moves.

Shading is premultiplied alpha with a gentle Fresnel lift. Additive was tried
first, for order-independence, and turned every volume grey: the destination is
a daylit scene with no headroom left, so adding any colour drifts it to white
and takes the camera's identity with it. The order-dependence that motivated
additive turned out not to exist - draw order is buffer order, so it is fixed
across frames.

### A frustum no longer smears across an occlusion edge
The volume rendered as a fan of blades. Ablating the geometry in the live page
showed the cause was the far cap, not the walls and not the shading: one ray
clears a porch post at 6 ft while its neighbour is stopped by it at 55 ft, and
the quad between them was drawn as a solid sheet from the post to the far lawn.
A grid over azimuth and elevation cannot represent that crease, so quads whose
corner ranges disagree badly are faded out and the cone visibly stops at the
obstruction.

### castRay3 had grown its own copy of the occlusion test
`frusta.js` carried a private axis-aligned `insideBox()`, so the drawn volume
ignored `yaw` and treated a cylinder or tree canopy as its bounding box -
disagreeing with the coverage figure beside it for exactly the occluders the
transform work added. It now goes through `insideOccluder()`, the same test
`blocked()` and the splatter use.

### The opening view frames the lot it loaded
`VIEW` is a fixed 100x88 ft box and the app boots a measured lot 199 ft across,
so the plan opened cropped with the boundary off screen and the 3D orbit opened
as a close-up of one wall. Both now frame the property.

### Round occluders get a centre handle
A selected tree or column drew four edge handles into a two-foot footprint,
stacking them into one black smudge with N/E/S/W printed over each other.

## 0.5.0

### Splatter was painted over the render, not into it
Coverage splatter was drawn as SVG polygons on top of the WebGL scene. SVG has
no depth buffer, so a patch of ground behind the house was painted straight
over the house. The 3D view filled with colour that appeared to float in front
of the geometry blocking it - which is exactly the class of failure the move
to WebGL was meant to end, reappearing in the overlay.

Splatter is now scene geometry: two triangles per quad, uploaded to the GPU and
drawn against the same depth buffer as everything else. Patches behind a
building are hidden by that building. They test depth without writing it, so
overlapping patches blend rather than one arbitrarily winning, and a polygon
offset keeps them off the surface they lie on.

The shader carries this in a `uSplat` path with per-vertex alpha smuggled
through the `aAO` attribute, which flat shading does not use. With `uSplat` 0
every existing path computes exactly what it did before.

### The plan view is an orthographic render of the same scene
The plan was a separate flat drawing. It is now the same scene through an
orthographic camera looking straight down, which means it shows the same
materials, the same ambient occlusion and the same splatter - the reason for
the change.

The projection is built to match `wx()`/`wy()` rather than approximate them:
the world point under the centre of the screen is the eye, and the half-extents
are the visible world half-width and half-height. Measured 0.000 px of
disagreement between the render and the diagram at three zoom levels, and 20 ft
of height shifts a point 0.000 px sideways, which is what makes it a plan
rather than a very high perspective.

The SVG layer keeps everything the render cannot do: grid, boundary, labels,
coverage cones, camera markers and every edit handle. What it no longer draws
is the flat grass, the projected sun shadows and the opaque building fills -
those would hide the render underneath. Buildings keep a thin outline.

Two atmosphere settings had to go for the plan: fog falls off with distance and
the ortho eye sits 400 ft up, which pinned it at maximum and washed the whole
view out; and a sky seen from above reads worse than the app's own background
for "outside the property".

### Fixed
- Dragging a camera with splatter on would have rebuilt a ~100 ms ray-cast on
  every pointer-move, because camera poses are part of the overlay cache key.
  The overlays now hold still during a drag and rebuild on release, the same
  way the coverage figures do.

## 0.4.3

### Dragging a camera view is now the default, and tracks properly
The hand tool is gone. Dragging anywhere on a camera view pans and tilts it -
no arming, no mode - and the cursor is a four-way move arrow, with a matching
icon in the corner as a quiet hint that the view is draggable.

The reason the first version felt wrong was a real defect, not a preference.
A camera frame is linear in BEARING but tangent in ELEVATION - that is the
cylindrical projection that lets a 189 degree lens be drawn at all. The drag
treated both axes as linear, so horizontal tracked the pointer while vertical
drifted away from it, and drifted further the further you were from the middle
of frame.

Both press and current pointer position are now converted into angles through
the actual projection, and the camera rotates by the difference. Whatever you
grab stays under the cursor, anywhere in frame, on both axes - verified to
within the 0.1 degree that tilt is deliberately quantised to.

### Tile / fullscreen toggle
A magnifier button on each view, plus for fullscreen and minus for back to
tiled. It takes over the click-to-maximise that used to live on the whole
cell, which had to go: the cell is a drag surface now, and a stray click at
the end of a drag should not rearrange the grid.

Fullscreen centres the view and grows it to the largest size that still fits
the stage. A camera frame has the sensor's fixed aspect, so filling both axes
is not on offer - filling one and centring on the other is.

### Fixed while building this
- `.povcell svg` styled every SVG inside a cell, not just the overlay, so the
  icons inside the new button and hint were stretched to fill the cell and
  collapsed to zero. Scoped to the direct child.
- A maximised cell briefly sized itself to 7x2 px: `margin:0 auto` makes a
  grid item shrink-to-fit, and both the canvas and the overlay inside are
  absolutely positioned, so there is nothing to measure. It takes an explicit
  width.

## 0.4.2

### The 3D overlay did not line up with the 3D view
Camera markers and box edit handles sat away from the geometry they belong to,
by an amount that changed every time you orbited.

Two projections have to agree in that view: WebGL draws the scene, and an SVG
layer draws the handles on top - which is the whole reason the SVG layer
survived the WebGL rewrite. They did not agree. GL rendered in **perspective**
from `orbitEye()`; `proj()` projected **orthographically**. Two such
projections can only coincide at a single point, and diverge further with
orbit angle and with distance from the centre of the view.

Measured before the fix, against the default house: 86-142 px of error at the
default orbit, 129-195 px at another angle, and 97-220 px once panned. After:
0.000 px at every angle tested.

`proj()` now derives from the same matrices GL just drew with, so the two agree
by construction rather than by coincidence. The orthographic path remains, and
is still correct, for the case where WebGL is unavailable - there `proj()` *is*
the renderer.

### Panning did not move the 3D scene
`orbitEye()` contained `panX*0`, so panning moved the SVG overlay and left the
rendered scene where it was. Pan now slides eye and target together along the
view's own axes, using a basis that matches `GL.M4.lookAtLH` exactly - taking
the right vector from anywhere else makes panning drift diagonally.

### Dragging a roof edge tracked the pointer at the wrong rate
The same orthographic assumption: the pixels-to-feet factor was a fixed
function of zoom and elevation, but under perspective it depends on how far the
handle is from the eye. It is now measured from whichever projection is live,
by probing it, so the GL and fallback paths stay honest without either knowing
about the other.

## 0.4.1

### Pan and tilt travel in the catalog
The hand tool clamped tilt to a generic -25..60, which was a placeholder. PT
cameras now carry their real head travel, transcribed from the manufacturers:

| camera | pan | tilt |
|---|---|---|
| Reolink RLC-823A | 360° | 0–90° |
| Reolink TrackMix PoE | 355° | 0–90° |
| Reolink E1 Outdoor SE | 355° | 0–50° |

`tiltMin`/`tiltMax` are absolute in this app's convention - down-tilt degrees,
0 horizontal, 90 straight down - so they drop straight into the model. An E1
can no longer be tilted above horizontal by the hand tool, because the hardware
cannot do it.

`panRange` is different: it is total travel measured from however the bracket
was mounted, not an absolute bearing. It therefore needs a reference, recorded
as `panHome` when a camera is placed, and a head with no recorded mount bearing
stays unrestricted rather than being given an invented limit. Anything sweeping
350° or more is treated as free - all three of these do - so pan limits only
bite on a genuinely restricted head.

Reolink publish the E1's tilt as "50°" without saying where it starts. The
0–50 mapping is an assumption and says so, in the catalog and in the property
editor.

## 0.4.0

### Drag to pan and tilt
A hand button on each camera view. Arm it and drag the view itself to aim the
camera: grab semantics, so the scene follows the hand and dragging the full
width of the frame sweeps exactly one horizontal field of view. Pressing the
hand and dragging straight off it works without arming first.

The head respects its limits. Tilt is bounded (-25 to 60 degrees by default,
editable per camera); pan is unbounded unless you set a range, because a PTZ
that sweeps 355 degrees is effectively free and a fixed camera is re-aimed by
moving the bracket. A bounded pan snaps to whichever end is nearer rather than
wrapping the long way round. Hitting a limit says so.

A PT circuit travels with the head, the same way the D-pad has always moved it.

Dragging redraws only that one cell. A full render would re-march the coverage
cones and repaint the plan on every pointer-move; the plan and the figures
catch up when the drag ends.

### Fixed
- Camera views were sized from the legacy `lens` tag, so a Duo added from the
  catalog got a normal-width cell instead of a double-width one. The width now
  comes from the spec's field of view.
- `setPointerCapture` could throw and abort a drag; a failed capture is no
  longer fatal.

## 0.3.1

Performance pass on the plan and 3D views, plus a splatter regression found
while measuring.

### The stutter
Measured, not guessed. A camera drag cost 114 ms per pointer-move. Ablation
put essentially all of it in one place: with cones switched off the rest of
the plan view - grass, boxes, cameras, grid, the SVG itself - came to about
1 ms, and the cone march to 85.

Three causes, each fixed separately and measured:

- **The cone march ran twice per camera.** `qual()` already returns 0/1/2, but
  the detection and face-ID tiers each marched the whole cone and discarded
  the other tier. One march now produces both.
- **Cone geometry was rebuilt from screen coordinates every frame.** It is now
  produced in world space and cached per camera, so panning and zooming
  re-project rather than re-march, and dragging one camera leaves the other
  five cached. Cache detail is deliberately not part of the key: a coarse
  request reuses an existing fine result, which removes a hitch on the first
  frame of every drag.
- **A coarse coverage sweep ran synchronously on every render**, costing 22 ms
  for a figure the worker replaces 160 ms later. It now runs only when there
  is nothing at all to show; otherwise the previous numbers stay up, dimmed.

### GC, not algorithms
With those fixed, frames still spiked from 8 ms to 45 on no particular
schedule while doing an identical amount of work. That was garbage collection:
`drawPlan` tore down and rebuilt all ~250 SVG nodes per pointer-move. The plan
is now built in four layers - base, cones, occluders, cameras - of which base
and occluders are cached against the geometry, view transform and selection.
Dragging a camera rebuilds about 50 nodes instead of 250, and measures zero
static rebuilds across a whole drag.

The split is by paint order, not convenience: cones must draw over the grass
but under the buildings, or a building stops visually occluding the coverage
it blocks.

### 3D overlays cached
Frustum solids and splatter are ray-cast, at roughly 30 ms and 100 ms. Every
property edit in 3D was paying for both. They now cache against the geometry,
the camera poses and the coverage options.

### Measured
| interaction | before | after |
|---|---|---|
| camera drag | 114 ms/frame | 10.8 |
| background pan | ~114 ms/frame | 2.8 |
| idle render | 25 ms | 4.3 |
| 3D render | 31.5 ms | 7.6 |

What remains is the one genuine re-march of the camera being dragged, 9.2 of
those 10.8 ms.

### Splatter was broken
`seesPoint()` still called `hitsWarped`, which was removed when the shape tests
moved into `shapes.js` in 0.3.0. Switching splatter on threw immediately.
Nothing in the verification suite turned it on, so it shipped.

It now goes through the same `hitsOccluder()` as everything else, which also
means it picks up transforms, cylinders and the DORI tiers rather than the old
hardcoded 20 ft face-ID line. `tests/verify.py` now builds both overlays and
renders splatter through the UI - 30 checks.

### Occluders draw rotated in plan
The plan view drew every occluder as an axis-aligned rectangle, so a yawed or
parented one appeared unrotated while blocking rays where it actually was.

## 0.3.0

Equipment catalog, a scene tree, occluder transforms and project persistence.
The app stops being a geometry sketchpad with two hardcoded lenses and starts
being a planner for real equipment.

### Source layout
Source moved to `src/*.js`, built into `index.html` by `scripts/build.js`. The
split was mechanical and verified byte-identical against the pre-split file, so
the refactor provably changed no behaviour. The published artifact is still one
self-contained file; only the source is navigable now.

### Equipment catalog
NVRs and cameras come from `catalog/*.json`, fetched at runtime, merged with a
copy embedded in every saved project and with any file the user imports.

Entries merge by id. Byte-identical duplicates collapse; where an id collides
and any stat differs, **both are kept as variants** tagged by source. Nothing
is ever overwritten, so reopening an old plan cannot silently move its coverage
percentages or its cost.

The trade-off, taken deliberately: the catalog is fetched, so it does not work
from `file://`. A saved project still opens anywhere because it carries its own
copy. Only a brand-new project opened from disk sees an empty picker, and it
says why.

Seed catalog is 4 NVRs and 9 cameras transcribed from manufacturer pages, each
dated. Prices are absent - none of the sources were authoritative and they move
constantly, so price is a per-unit field you fill in.

### Range is now derived
`LENS`, with its hardcoded `r:40` / `r:65` and flat 20 ft face-ID line, is gone.
Range comes from pixel density and EN 62676-4 (DORI): face-ID at identify
(250 px/m), detection at recognise (125 px/m).

Density is angular, not rectilinear:

    pxPerM(d) = resW / (fovH_radians * d)

The textbook form divides by `tan(fovH/2)`, which at the Duo's 189 degrees
diverges and returns a range under a foot. These are barrel-distorted wide
lenses rendered cylindrically - the projection the renderer already uses - so
angular density is the form that agrees with the picture.

Measured on the house: near-building coverage 81 percent, unchanged, but
face-ID rises 34 to 72 percent because identify now reaches 33 ft rather than a
flat 20, and whole-lot coverage 39 to 48 percent.

A day/night toggle clamps range to `max(irFt, floodlightFt)` at night, which is
what makes the IR and floodlight figures mean something. A camera with neither
contributes no coverage at night at all.

### Occluder transforms
Occluders carry `parent` and `yaw`, composed through `worldM()`. Children move
with their parent; the tree reparents by drag and refuses cycles.

Intersection did **not** gain oriented-box maths. The ray is transformed into
the occluder's local frame and the original slab test runs there unchanged, so
the tested code survives verbatim. With yaw 0 and no parent the matrix is
exactly the identity - every pre-transform scene reads as world coordinates.

### New primitives
A real cylinder, plus an ellipsoid canopy for the tree preset. Presets:
building, sloped roof, column/post, fence run, tree.

### The mirrored-pair hazard is gone
`MESH.makeCaster` used to mirror `blocked()` by hand, and the developer guide
warned they had to be changed in lockstep. They now both call `hitsOccluder()`
in `shapes.js`; only loop policy differs. The coverage worker is held to the
same rule by being assembled from the source text of the live functions, so it
cannot be running different logic.

### UI
The 340px right panel is gone. A resizable left sidebar holds a collapsible
scene tree (NVRs owning cameras, occluders nesting) above a property editor for
the current selection. Scene-wide settings live under the Project node; the
frequently-flipped layers moved to a strip over the stage. A status bar carries
NVR and camera counts, channels used, cost, coverage static and swept, storage
and estimated recording days.

fps and quality resolve camera -> NVR -> project, with inherited values shown
greyed. PT circuit editing stays with the camera.

### Persistence
Autosave to localStorage, plus export/import of a project document that carries
the scene and its catalog snapshot. The `PLAN v3` paste format is unchanged.

### Coverage recompute
A coarse pass runs immediately; the full pass runs in a worker once interaction
settles, with the previous figures dimmed while it is in flight.

### Verification
`tests/verify.py` — 27 Playwright checks, all passing. The two that matter
most: `blocked()` and `makeCaster` agree on every sampled ray across box,
cylinder and ellipsoid, and the worker reproduces the main-thread sweep exactly.

### Fixes found while building this
- Catalog dedup never matched. `JSON.stringify(e, keys)` applies its replacer
  array to nested objects too, so `{resolution:{w,h}}` lost `w` and `h`; and
  the stored entry's own `key` field leaked into its fingerprint. Every
  re-import created a duplicate.
- The 3D view rendered nothing after the layout rewrite. `#view3d` is the SVG
  handle overlay and must sit above the GL canvas *and* be transparent; it had
  been given z-index 3 and an opaque sky gradient, painting over the whole
  render.
- The mesh cache key did not include `yaw`, `parent`, `shape` or the cylinder
  radii, so rotating an occluder left a stale bake.

## 0.1.0

First working version.

### Geometry
- Occluder boxes with four independent corner heights on base and top, so pitched roofs are real slabs rather than wedges
- 3D occlusion by slab test for flat boxes, sampled bilinear surface for warped tops
- Property boundary polygon with vertex add/move/delete and scale-to-known-area
- Perimeter fence as exact vertical panels on the boundary edges

### Cameras
- 88° PTZ and 180° dual-lens models with distinct range, vertical FOV and pixel density
- Mount height and down-tilt, giving a real dead cone beneath each camera
- PT circuits with per-stop dwell, animated with eased movement at 1×/4×/10×

### Views
- Plan with vector coverage cones or rasterised heatmap, pan and zoom
- 3D with orbit, pan, zoom, per-face and per-edge editing handles
- Frustum solids clipped against real geometry
- Splatter mode colouring every surface by which camera sees it
- Per-camera POV grid, cylindrical projection, with aiming D-pads
- Split view combining plan and cameras
- Materials, north-east sun, Lambert shading and projected shadows

### Fixes worth recording
- Occluder boxes were skipped entirely when sampling their own faces, so they failed to block rays to their far side
- Splatter had no back-face culling, lighting faces the camera was behind
- POV clipped only against the near plane; a point could sit in front of the lens but outside the horizontal FOV and stretch its edge across the frame
- POV had no vertical bound, so a quad with one corner far below the frame smeared across the view
- POV had no back-face culling, so a camera mounted 0.2 ft off a wall saw through it to the far side of the building
- Surface normals came from winding order and were sometimes inverted, mislighting faces

## 0.2.0

Replaces the SVG painter's-algorithm 3D and camera views with a depth-buffered
WebGL rasteriser, and swaps cast shadows for baked ambient occlusion.

### Why
Measured against ray-cast ground truth, the painter renderer overdrew the house
wall in C1's camera view by six times: 40% of frame drawn against 7% actually
visible. A polygon that wraps behind the lens cannot be clipped and filled
correctly in a cylindrical image, so no amount of clipping work fixes it. A
depth buffer resolves visibility per fragment and the whole class of bug goes
away — back-face culling, near-plane wrapping, painter ordering.

### Rendering
- WebGL context, shaders, matrix helpers and sky pass, inlined
- Tessellated mesh builder with per-vertex AO, inlined
- Everything stays in one file. An earlier cut of this branch split the
  renderer into `gl.js` and `mesh.js`, which silently broke the 3D and camera
  views anywhere the siblings could not be fetched — a sandboxed viewer, an
  email attachment, a lone file on a USB stick. The plan view still worked, so
  the failure was easy to miss. Single-file is a correctness property here, not
  a preference.
- If WebGL is unavailable the renderer falls back to the SVG path rather than
  failing. Verified by forcing context creation to fail: 3D still draws 610
  polygons and the camera views 138.
- Duo cameras render as two 90 degree perspective halves side by side, which is
  what the hardware does: two sensors stitched. Avoids wide-angle projection
  distortion rather than trying to correct for it.
- The plan view stays SVG. The 3D editing handles stay SVG, overlaid on the GL
  canvas, so dragging a roof edge is still ordinary hit-testing.

### Ambient occlusion
Baked on the CPU by hemisphere sampling (24 cosine-weighted directions, 9 ft
radius) using the same ray intersection code as the coverage model, so the
shading cannot disagree with the occlusion maths. AO is a vertex attribute, so
faces are tessellated to ~2.2 ft cells — a wall drawn as two triangles would
carry no gradient at all.

Measured: 24,684 vertices, AO range 0.25 to 1.00, roughly 0.7 to 2.0 s to bake,
cached against a scene hash and rebuilt only when geometry changes.

### Rendering bugs found after the first cut
- `glClear(DEPTH_BUFFER_BIT)` is gated by `depthMask`. Clearing after
  `depthMask(false)` for the sky pass was a silent no-op, so last frame's depth
  survived: the 3D view smeared under orbit and the second 90 degree half of
  each Duo tested against the first half's depth. Clear first, with the mask
  open.
- A WebGL context is bound to one canvas element for life, and browsers cap how
  many may exist at once. Camera cells were rebuilt on every redraw while
  contexts were cached by camera id, so each redraw leaked a context and handed
  back one pointing at a destroyed canvas. Under animation the cap was reached
  and every camera view went black. Contexts now live on the canvas element and
  cells are reused when the camera set has not changed.
- Resizing a canvas blanks it. A ResizeObserver redraws affected cells.

### PT circuits: bounce playback
Three stops, swept out and back rather than wrapped: 1 -> 2 -> 3 -> 2 -> 1.
A real PT head has to travel back through the middle regardless, so wrapping
straight from the last stop to the first was a fiction that also left the far
side of the arc unwatched for the whole return swing.

Stops are ordered by bearing rather than by the order they were added, so the
head sweeps monotonically to one end and back. On the measured layout this cuts
travel per cycle from 422 to 254 degrees on C3, 432 to 252 on C5 and 290 to 188
on C6, with C4 unchanged because its stops were already in order.

Duty-cycle maths accounts for the middle stop being visited twice per cycle.

### Handedness and camera framing
Every GL view was mirrored horizontally. The scene model is left-handed - x
east, y south, z up, so x cross y points down - and a conventional right-handed
`lookAt` therefore produces a reflected image. In the dual-lens cameras it
mirrored each 90 degree half independently, which is why they read as two
overlapping views rather than one continuous 180.

Negating y on both the mesh and the camera does not fix it: mirroring the scene
and the observer together leaves the image unchanged. The fix is a view matrix
built explicitly for a left-handed world, with screen-right taken as world-up
cross forward, plus `frontFace(CW)` because that basis has determinant -1.

Camera cells are now sized to the modelled field of view, `2 tan(h/2)/tan(v/2)`,
so the render shows exactly the FOV the coverage model uses with square pixels:
3.84:1 for the 180 degree lens, 2.55:1 for the 88.

The two halves of a dual-lens view meet at the aim bearing with a few pixels of
seam. That is inherent to stitching two perspectives and is present on the real
hardware; widening the frusta to close it only zooms each half out and makes the
gap larger.

### Single-pass 190 degree camera view
The dual-lens view was rendered as two 90 degree perspective halves side by
side. That was a workaround for a real constraint - a perspective divide
diverges as the half-angle approaches 90, so it cannot reach 180, let alone
past it - but it left a visible seam at the aim bearing and split the image
into two frusta that read as overlapping.

Replaced with a cylindrical projection in the vertex shader: screen x is
proportional to bearing, screen y to the tangent of elevation, depth linear in
distance. Verified exact to 0.00000 NDC units across the full sweep from -95 to
+95 degrees. Vertices that wrap past the barrel behind the camera are pushed out
of the clip volume so the rasteriser trims the triangle rather than smearing it
across the frame.

The mesh is already tessellated to roughly 2.2 ft for the AO bake, which is what
makes this viable: straight world edges are curves in a cylindrical image, and
coarse triangles would render them as chords.

A post placed dead ahead now renders as one continuous run of pixels rather than
two runs either side of a seam. Duo cells are sized 3.19:1, which is
halfH(radians)/tan(halfV) - square pixels at frame centre for a cylindrical map.

The modelled Duo FOV is now 189 degrees rather than the 180 on the spec sheet,
so coverage figures move slightly: near-building coverage 79 to 81 percent.

### Camera frames match the sensor
The camera views were shaped from the modelled field of view - 2.55:1 for the
E1, 3.17:1 for the Duo - which is neither camera's actual output. The E1 records
3840x2160 (16:9) and the Duo 7680x2160 (32:9).

Checking why exposed a real inconsistency in the specs. Reolink quote the E1
Outdoor SE at 88 degrees horizontal and 41.5 vertical on a 16:9 sensor, and no
standard projection reconciles those: rectilinear would need 69 vertical for
88 horizontal, equidistant 74. It is not a one-off - the E1 Outdoor CX is quoted
at 89 x 46, ratio 1.93, equally unreconcilable. These are wide lenses with
barrel distortion, so the recorded image is not rectilinear and an H/V pair can
legitimately exceed what tangent geometry allows.

So the frame is now the sensor's shape and the field of view is mapped to fill
it: linear in bearing horizontally, tangent in elevation vertically. Verified
that both axes land on exactly +/-1.0000 in NDC at the FOV edges for both lens
types. Every camera goes through one projection path now; the perspective path
is gone, which also removes the last place a lens under 110 degrees behaved
differently from a wide one.

This changes the picture, not the numbers: the coverage model already used
88 x 41.5 and 189 x 55, and still does.

### Still outstanding
Per-pixel equivalence between the GL render and a CPU ray-cast reference is not
yet verified. Several attempts foundered on the test harness rather than the
renderer: classifying materials by pixel colour proved too brittle once
lighting, AO and fog were applied, and a flat-shading debug uniform did not read
back reliably. The projection maths is verified exactly; what the rasteriser
then does with it is not. A flat-shading debug uniform was added for this but the harness
did not read back reliably, so the claim that visibility is now exact rests on
the depth buffer being correct by construction rather than on measurement.
