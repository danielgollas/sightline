# Developer guide

Orientation for anyone — human or agent — picking this up cold.

Read `README.md` first for what the tool is and why the naive 2D model is wrong.
This document is about the code.

---

## Shape of the thing

One file. `index.html`, ~2,570 lines, no build step, no dependencies, no network
access. Open it and it runs.

**Single-file is a correctness property, not a style preference.** An earlier
revision split the renderer into `gl.js` and `mesh.js` and it silently broke
anywhere the siblings could not be fetched — sandboxed viewer, email attachment,
file on a USB stick. The plan view kept working, so the breakage was easy to
miss. If you split it, you own that failure mode.

Section markers are `/* ------- name ------- */` comments. Rough map:

| Lines | Section |
|---|---|
| 225–470 | `GL` — matrix helpers, shaders, context, draw call |
| 471–700 | `MESH` — scene ray caster, AO bake, mesh builder |
| 705–830 | State, lens table, defaults, the `MEASURED` preset |
| 828–940 | 3D occlusion: the coverage model's core |
| 939–1030 | World/screen transform, coverage raster, vector cones |
| 1031–1160 | Plan view (SVG) |
| 1162–1300 | Splatter and frustum solids |
| 1304–1380 | Materials, sun |
| 1377–1680 | Camera POV |
| 1680–1830 | 3D view (SVG overlay for handles) |
| 1828–1995 | WebGL scene wiring and `render()` |
| 1996–2165 | Interaction: plan and 3D |
| 2165–2570 | Side panel, layout code, presets, PT animation |

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

`MESH.makeCaster` deliberately mirrors `blocked()` rather than sharing it,
because the AO bake needs a hot loop without the layer-toggle lookups. **If you
change occlusion semantics in one, change the other.** This is the sharpest edge
in the codebase.

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

---

## Rendering

The 3D and camera views are WebGL with a real depth buffer. The plan view and
the 3D editing handles are SVG, overlaid.

**Why the split.** Editing handles are `<polygon>` elements with `data-box`
attributes, so dragging a roof edge is ordinary hit-testing. In pure WebGL each
becomes a raycast against a mesh plus a synced HTML overlay. The handles are the
reason the SVG layer survives.

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

There is no test suite. Everything in the changelog was verified with Playwright
driving the page and reading pixels or internals back. That approach found every
real bug; reasoning about correctness did not.

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
