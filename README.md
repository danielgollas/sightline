# Sightline

A security camera coverage planner that answers one question honestly: **what can each camera actually see?**

Not what it's pointed at. Not what the spec sheet claims. What survives the walls, roofs, posts, fences and mounting heights that are really there.

Single self-contained HTML file. No build step, no dependencies, no network. Open `index.html`.

---

## Why it exists

Most camera planning is done with flat 2D wedges on a floor plan. That model is wrong in ways that matter:

- A **roof casts a finite shadow**, not an infinite one. An 8 ft porch roof seen from an 11 ft camera blocks the ground beneath it, then coverage resumes a few feet out. Flat models say "blocked forever" and you plan around a dead zone that isn't there.
- A camera has a **vertical field of view and a down-tilt**, so there is a dead cone directly beneath it. An E1 at 11 ft with 41.5° vFOV and 15° tilt sees nothing inside ~11 ft of its own base. Someone standing against the wall under it is not on camera.
- **Fence height matters enormously below ~5 ft and barely at all above it**, because a tall camera looks over the top and the shadow closes within a few feet.
- A camera mounted flat on a wall **cannot watch that wall**. Walls are watched by the adjacent corner.
- A **180° lens wants mid-wall; an 88° lens wants a corner.** Put the wide lens on a corner and the 90° of building between the two walls eats half the sensor.

Sightline models all of this in 3D and reports coverage as a percentage of ground you actually own.

---

## What it does

**Geometry**
- Occluder boxes with independent corner heights on both the base and the top, so a pitched roof is a real slab rather than a wedge
- Editable in plan (drag corners, drag to move) or in 3D (drag an edge to tilt, a face to move it)
- Property boundary polygon with add/move/delete vertices, plus an optional perimeter fence of any height

**Cameras**
- Two lens models: 88° PTZ and 180° dual-lens, each with its own range, vertical FOV and pixel density
- Mount height and down-tilt per camera
- PT circuits: up to four stops with individual dwell times, animated at 1×/4×/10×

**Views**
- **Plan** — vector coverage cones, occlusion-clipped, or a rasterised heatmap
- **3D** — orbit, pan, zoom; frustum solids clipped by real geometry; splatter mode painting every surface by which camera sees it
- **Cams** — each camera's own image, cylindrical projection, back-face culled, with a D-pad to aim from within the view
- **Split** — plan and camera views together

**Measurement**
- Coverage of open ground inside the boundary, split into "near buildings" (within 25 ft) and whole-lot
- Face-ID range distinguished from mere detection
- For PT circuits, the share of each cycle a spot is actually watched — swept coverage is not continuous coverage

---

## Layout code

The whole scene serialises to plain text so it can be pasted into a chat, a ticket or a commit message:

```
CAM C1 | ON | DUO | x 12.7 | y -0.2 | z 11 | a 270 | t 41.5 | N wall Duo 3V
TOUR C3 | home 20 | 68,28.5,8 | 152,28.5,8
PROP -44.3,-41 | 149.7,-6.6 | 150.7,42.2 | -48.6,51.6
FENCE | ON | h 8
BOX B2 | ON | x0 25 | y0 -1 | x1 33 | y1 10.5 | base 12/9.5/9.5/12 | top 12.5/10/10/12.5 | Back porch roof
```

Coordinates are feet. `x` east, `y` south, `a` bearing (0 = east, 90 = south), `z` mount height, `t` down-tilt.

---

## Rendering

SVG with painter's algorithm, not WebGL. There is no depth buffer.

This is a deliberate trade: the 3D geometry shares the DOM with the UI, so a roof face is a `<polygon>` with a `data-box` attribute and editing it is ordinary hit-testing rather than a raycast against a mesh. It keeps the file dependency-free and resolution-independent.

The cost is that painter's algorithm cannot resolve interpenetrating or cyclically overlapping polygons. In practice the geometry is axis-aligned boxes that meet at joints rather than genuinely interpenetrating, and centroid-depth sorting handles them. Back-face culling does the work a z-buffer would otherwise do.

If shadow maps, per-pixel occlusion, or a much larger scene were needed, this would want rebuilding on Three.js.

---

## Keyboard

| Key | |
|---|---|
| `2` `3` `4` `5` | plan · 3D · cameras · split |
| `Space` | play the PT circuit |
| `F` | fit view |
| `V` | frustum solids |
| `S` | splatter |
| `O` | occlusion on/off |
| `G` | grid |
| `B` | restore measured boundary |
| `E` | edit boundary |
| `Esc` | deselect |

---

## Status

Models one specific property in detail. The geometry is a preset, not a limitation — replace it via the layout code or by editing occluders directly.
