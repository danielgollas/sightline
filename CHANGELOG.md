# Changelog

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
