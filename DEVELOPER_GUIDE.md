# Developer guide

Orientation for anyone — human or agent — picking this up cold.

Read `README.md` first for what the tool is and why the naive 2D model is wrong.
This document is about the code.

---

## Shape of the thing

Source lives in `src/*.js`. `index.html` is **generated** — `node scripts/build.js`
concatenates the modules listed in `src/manifest.json` into
`src/index.template.html` at the `/*MODULES*/` marker. Edit `src/`, run the
build, commit both.

**The single-file rule now applies to the artifact, not the source.** The
published `index.html` still has no imports, no bundler runtime and no sibling
fetches, because an earlier revision split the renderer into `gl.js` and
`mesh.js` and silently broke anywhere the siblings could not be fetched —
sandboxed viewer, email attachment, file on a USB stick. That failure mode is
still real; the build is what keeps it away from users. If you make the
published file load anything from beside itself, you own it.

The split was done mechanically and verified byte-identical against the
pre-split file (`scripts/split-once.js` is kept for that provenance). If you
ever doubt the build, that check is the one to repeat.

**The equipment catalog is the one deliberate exception.** `catalog/*.json` is
fetched at runtime and therefore does *not* work from `file://`. That is an
accepted trade-off, not an oversight: every project embeds a copy of the
catalog entries it uses, so a saved scene is self-describing anywhere. Only a
brand-new project opened from disk sees an empty picker, and it says so.

Modules, roughly in dependency order:

| Module | What it owns |
|---|---|
| `gl.js` | matrix helpers, shaders, context, draw call |
| `mesh.js` | AO bake, mesh builder, the bake's ray caster |
| `util.js` | tiny helpers; `lensOf()` derives the old lens shape from a spec |
| `state.js` | scene state, `opts`, occluder presets, legacy migration |
| `shapes.js` | **transforms and every shape intersection test** |
| `catalog.js` | catalog merge/variants, pixel density, DORI ranges |
| `occlusion.js` | `blocked()`, `qual()`, PT sweep — the coverage core |
| `raster.js` `cones.js` `plan.js` | plan view |
| `splat.js` `frusta.js` `materials.js` | 3D overlays |
| `pov.js` `view3d.js` `glscene.js` | camera views and WebGL wiring |
| `coverage.js` | the sweep, and the worker assembled from its own source |
| `project.js` | persistence, import/export, cost and storage maths |
| `tree.js` `addmenu.js` `props.js` `statusbar.js` | the sidebar UI |
| `interact.js` `anim.js` | pointer handling, PT animation, boot |

---

## The one invariant that matters

**Everything that answers "can this camera see that point" goes through
`quality()` / `blocked()`.** The coverage percentages, the plan cones, the
splatter colours, the frustum solids and the AO bake all call into the same
intersection code.

That is deliberate. The whole premise of the tool is that the picture and the
numbers cannot disagree. If you add a rendering path that computes visibility
its own way, you have broken the premise, and the failure will be quiet — a
picture that looks plausible while the percentages say something else.

`MESH.makeCaster` used to *mirror* `blocked()` by hand, and this guide used to
warn that changing one meant changing the other. **That is no longer true, and
the change was deliberate.** Both now call `hitsOccluder()` in `shapes.js`.
What stays separate is loop policy: the caster skips the layer toggles because
it runs in the bake's hot loop, and it takes an unbounded ray with a `maxT`
rather than a 0..1 segment.

The coverage worker in `coverage.js` is held to the same rule by a different
trick: it is assembled from the **source text** of the live functions via
`Function.prototype.toString`, so it cannot be running different logic. If you
add a function the sweep reaches, add it to the list in `workerSource()` — a
missing one is a loud `ReferenceError`, not a wrong number.

`tests/verify.py` asserts `blocked()` and `makeCaster` agree on a sampled ray
set across box, cylinder and ellipsoid, and that the worker reproduces the
main-thread sweep exactly. Those are the checks to run before you trust any
change in here.

---

## Coordinate system

**Left-handed: x east, y south, z up.** So `x × y` points *down*.

This is not a mistake to be tidied away. It matches the plan view, where y
increases downward on screen like every floor plan, and the layout code is
written in it.

The consequence is that a conventional right-handed `lookAt` **mirrors every
view**. That bug shipped and took two attempts to fix. `GL.M4.lookAtLH` builds
the basis explicitly — screen-right is `worldUp × forward`, which puts south on
your right when you face east — and the basis has determinant −1, so
`frontFace(CW)` compensates.

Negating y on both the mesh and the camera does **not** fix it. Mirroring the
scene and the observer together leaves the image unchanged. Do not try it again.

Angles: `a` is a bearing, 0 = east, 90 = south. `t` is down-tilt in degrees,
positive looking down.

**Occluders now carry a transform.** Each has `parent`, `yaw` and a local
frame; `worldM()` composes the chain. Intersection does *not* use oriented-box
maths — the ray is transformed into the occluder's local frame and the original
axis-aligned slab test runs there unchanged. With `yaw` 0 and no parent the
matrix is exactly the identity, which is why every pre-transform scene still
reads as world coordinates. Only yaw is exposed; the pipeline is a general 4x4
so pitch and roll are a UI change rather than an architecture change, but note
that the bilinear warped-top code assumes z-up and would need revisiting.

---

## Rendering

The 3D and camera views are WebGL with a real depth buffer. The plan view and
the 3D editing handles are SVG, overlaid.

**The plan view is a render too.** Since 0.5.0 the plan is the same scene under
an orthographic camera looking straight down (`renderPlanGL`), with the SVG
layer reduced to the diagram: grid, boundary, cones, labels, handles. Its
projection is built to match `wx()`/`wy()` exactly, and `planRendered()` gates
the flat fills that would otherwise hide the render.

**Splatter is geometry, not an overlay.** It goes through `GL.drawSplat`
against the real depth buffer. Drawn as SVG it was painted over the render and
patches behind a building showed through them. If you are tempted to add
another overlay that represents something *in* the scene, that is the lesson:
an overlay cannot be occluded by the scene. Frustum solids are still SVG, and
still have this limitation.

**Why the split.** Editing handles are `<polygon>` elements with `data-box`
attributes, so dragging a roof edge is ordinary hit-testing. In pure WebGL each
becomes a raycast against a mesh plus a synced HTML overlay. The handles are the
reason the SVG layer survives.

**Two projections, one source.** Because the overlay sits on top of the GL
render, `proj()` MUST use the matrices GL just drew with - it reads `glView3D`,
set by `render3DGL_()`. It did not always: it projected orthographically while
GL rendered in perspective, which put handles up to 200 px from their geometry
by an amount that changed with every orbit. Two projections of the same scene
that are computed independently will disagree; the only fix is for one to be
derived from the other. The orthographic branch is still live and still correct
for `GLON === false`, where `proj()` is the renderer rather than an overlay.

Anything converting pixels to world units in this view (the face-drag rate, for
one) has the same obligation: probe the live projection rather than assume the
orthographic scale.

**Why painter's algorithm was abandoned.** Measured against ray-cast ground
truth, the SVG renderer overdrew the house wall in one camera's view by six
times — 40% of frame drawn against 7% actually visible. A polygon that wraps
behind the lens cannot be clipped *and filled* correctly in a cylindrical image,
so no amount of clipping work fixes it. `main` still has that renderer and it is
the fallback when WebGL is unavailable (`GLON === false`).

**Camera projection is cylindrical**, in the vertex shader: x linear in bearing,
y in tangent of elevation, depth linear in distance. A perspective divide cannot
reach 180°, let alone the modelled 189°. The mesh is tessellated to ~2.2 ft for
the AO bake, and that is also what makes the cylindrical path viable — straight
world edges are curves in a cylindrical image, and coarse triangles would render
them as chords.

Frames take the **sensor's** aspect (16:9 and 32:9) with the FOV mapped to fill
it. The quoted specs are not self-consistent — 88° × 41.5° cannot occur on a
16:9 rectilinear sensor, which would need 69° vertical — because these are wide
lenses with barrel distortion. Do not "fix" the FOV numbers to reconcile them.

---

## Ambient occlusion, not shadows

Baked on the CPU: 24 cosine-weighted hemisphere directions, 9 ft radius, per
vertex, using the scene ray caster. ~24,700 vertices, 0.7–2.0 s, cached against
a hash of `boxes`/`prop`/`fence` in `meshKey`.

Faces are tessellated because **AO is a vertex attribute**. A 25 ft wall drawn as
two triangles carries no gradient at all.

Do not add cast shadows back. AO was chosen because it reads the geometry
without implying a time of day, and because the shadow projection it replaced
was a convex-hull approximation that could not represent a hole.

---

## WebGL gotchas that already bit

- **`glClear(DEPTH_BUFFER_BIT)` is gated by `depthMask`.** Clearing after
  `depthMask(false)` for the sky pass is a silent no-op. Clear first, mask open.
- **A context is bound to one canvas for life**, and browsers cap live contexts
  around 16. Contexts live on the canvas element (`canvas.__ctx`) and POV cells
  are reused when the camera set is unchanged. Rebuilding cells per frame leaks
  a context per redraw and everything goes black under animation.
- **Resizing a canvas blanks it.** A `ResizeObserver` redraws affected cells.
- `preserveDrawingBuffer: true` is on so the canvas can be read back and saved.
  Costs a little; keep it unless you have a reason.

---

## Testing

`tests/verify.py` drives the real page with Playwright — 27 checks covering
transforms, the `blocked()`/`makeCaster` agreement, cylinder and ellipsoid
primitives, DORI ranges against hand arithmetic, catalog variant/dedup rules,
localStorage round-trip, the worker, and the measured AO invariants.

```
python3 -m venv pwenv && ./pwenv/bin/pip install playwright
./pwenv/bin/playwright install chromium
python3 -m http.server 8731 &            # the catalog needs http, not file://
./pwenv/bin/python tests/verify.py
```

Beyond that, everything in the changelog was verified the same way — driving
the page and reading internals back. That approach found every real bug;
reasoning about correctness did not.

Pattern that works:

```python
pg.goto("file:///path/index.html"); pg.wait_for_timeout(4000)
pg.click("#mpov"); pg.wait_for_timeout(9000)     # AO bake is slow, wait properly
print(pg.evaluate("""() => { /* call the page's own functions */ }"""))
```

Launch Chromium with `--use-gl=swiftshader --enable-unsafe-swiftshader` for
WebGL in headless.

**Two lessons paid for in wasted effort:**

Classifying materials by pixel colour is brittle once lighting, AO and fog are
applied. Several validation attempts failed on the harness rather than the code.
Prefer checking the maths directly — project a known point and compare NDC.

Check your test's expectations before concluding the code is wrong. A "mirrored"
verdict was a white marker being confused with the white house; a "compressed
projection" was sampling a cone instead of the camera's own horizontal plane.
Both looked like real bugs.

---

## Range model

Camera range is derived from resolution and field of view, not typed in.
Density is **angular**, because the camera views are a cylindrical projection:

    pxPerM(d) = resW / (fovH_radians * d)

The textbook rectilinear form, `resW / (2 d tan(h/2))`, is wrong here and not
subtly: at the Duo's 189 degrees `tan(94.5)` diverges and it returns a range
under a foot. Do not "correct" it back.

Two tiers, on EN 62676-4 (DORI): face-ID at identify (250 px/m), detection at
recognise (125 px/m). Both are clamped — in daylight by an optional per-camera
`maxRangeFt`, at night by `max(irFt, floodlightFt)`, and a camera with neither
contributes nothing at night.

---

## Performance

The plan view's cost is almost entirely the coverage cone march - with cones
off, everything else (grass, boxes, cameras, grid, the SVG) is about 1 ms
against 85. Three things keep it interactive, and all three are load-bearing:

- **One march per camera, not one per quality tier.** `qual()` returns 0/1/2;
  marching once per tier doubled the work for nothing.
- **Cone geometry is world-space and cached** (`conesFor`), so pan and zoom
  re-project rather than re-march, and dragging one camera leaves the others
  cached. Detail is deliberately absent from the cache key so a coarse request
  can reuse a fine result - otherwise grabbing the pointer re-marches every
  camera on the first drag frame.
- **The plan SVG is built in four layers**, base / cones / occluders / cameras,
  of which base and occluders are cached against geometry, view transform and
  selection. Rebuilding all ~250 nodes per pointer-move produced enough garbage
  that GC turned 8 ms frames into 45 ms ones. The layer split is by paint
  order, not convenience: cones draw over the grass but under the buildings.

The 3D ray-cast overlays (frustum solids, splatter) are cached the same way.

Measured on the default house: camera drag 10.8 ms/frame, pan 2.8, idle render
4.3, 3D render 7.6. Of the drag's 10.8, about 9.2 is the one genuine re-march
of the camera being moved - that is the floor without a broad-phase.

If you change anything in here, re-measure rather than reason. The bottleneck
was not where call counts suggested: memoising the most-called function in the
inner loop (196k calls per frame) made it *slower*.

---

## Still open

**Per-pixel equivalence between the GL render and a CPU ray-cast reference is
unverified.** The projection maths is exact to 0.000000 NDC; what the rasteriser
then does with it has not been measured. A flat-shading debug uniform (`uFlat`)
exists for this and did not read back reliably. This is the most valuable
outstanding piece of work.

Lower priority: the plan view still draws its own cones rather than sharing the
GL path; the `drawPOV_svg_unused` fallback is dead code unless WebGL fails; and
there is no licence file.

---

## Domain notes worth keeping

The tool encodes findings that are easy to undo by accident:

- A camera mounted flat on a wall **cannot watch that wall**. Walls are watched
  by the adjacent corner.
- A **180° lens wants mid-wall; an 88° lens wants a corner.** On a corner the
  wide lens loses 90° to the building.
- Fence height matters enormously below ~5 ft and barely at all above it.
- Roof shadows are **finite**. Coverage resumes past the shadow's edge.
- Swept coverage from a PT circuit is not continuous coverage. The duty-cycle
  figure exists to stop that being forgotten.
