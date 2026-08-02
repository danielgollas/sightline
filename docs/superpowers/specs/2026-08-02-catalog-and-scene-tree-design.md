# Design: equipment catalog, scene tree and project persistence

Date: 2026-08-02
Status: approved in brainstorming, not yet planned

## Goal

Turn Sightline from a geometry sketchpad with two hardcoded lens types into a
planner for real equipment: pick NVRs, hang compatible cameras off them, build
structures from named primitives, and see cost, storage and coverage for the
whole design. The scene becomes a saved project rather than a page you re-enter
by hand.

## Scope

Ten user-stated requirements, built as one release rather than staged. The
sequencing risk was raised and accepted: the coverage-model change and the UI
rewrite land together, so a regression in the first release can originate in
either.

---

## 1. Catalog

### Structure

Two flat arrays per file. Deliberately dumb, so a user-authored file is
trivial to write by hand.

```json
{
  "version": 1,
  "nvrs": [
    {
      "id": "reolink-rln8-410",
      "brand": "Reolink",
      "model": "RLN8-410",
      "channels": 8,
      "storageGB": 2000,
      "maxStreamsMbps": 80,
      "cost": 199.99,
      "currency": "USD",
      "links": [{ "label": "Reolink", "url": "https://..." }],
      "compat": ["reolink"],
      "checked": "2026-08-02"
    }
  ],
  "cameras": [
    {
      "id": "reolink-e1-outdoor-se",
      "brand": "Reolink",
      "model": "E1 Outdoor SE",
      "resolution": { "w": 3840, "h": 2160 },
      "formats": ["H.265", "H.264"],
      "fovH": 88,
      "fovV": 41.5,
      "ptz": true,
      "irFt": 98,
      "floodlightFt": 0,
      "poe": true,
      "wifi": false,
      "cost": 79.99,
      "currency": "USD",
      "links": [{ "label": "Reolink", "url": "https://..." }],
      "compat": ["reolink"],
      "checked": "2026-08-02"
    }
  ]
}
```

`compat` is a list of free-form tags. A camera is compatible with an NVR when
the two share at least one tag. This keeps compatibility declarative instead of
an N×M matrix, and lets a user file invent its own tags without coordinating
with the app-maintained catalog.

`checked` is the date the entry's specs were last verified against the
manufacturer's published sheet. Cost and links are indicative and dated, not
authoritative — they go stale and the UI says so.

### Provenance

The seed catalog is researched from published manufacturer specifications
(roughly 6–10 NVRs and 15–25 cameras). No entry is invented. Any field that
cannot be verified is omitted rather than guessed, and the UI renders a missing
field as "not specified" rather than zero.

### Resolution order at load

1. The **project's embedded copy** — always present, always usable.
2. `fetch('./catalog/nvrs.json')` and `./catalog/cameras.json` — enrichment
   only. Failure is an expected state, not an error: it always fails on
   `file://`. Nothing is logged as a fault; the picker simply shows what the
   project embeds, plus an import prompt when that is empty.
3. Any **user-imported file** persisted in localStorage.

Entries merge by `id`. Byte-identical duplicates collapse. Where an `id`
collides and any stat differs, **both are kept as variants**, disambiguated in
the picker by source badge (`project` / `catalog` / `imported`). Nothing is
overwritten, so reopening an old plan never silently moves its coverage
percentages or its total cost.

### Accepted trade-off

The single-file property no longer covers the catalog. Opened from `file://` a
brand-new project shows an empty picker and an import prompt. The
plan/3D/camera app still works standalone; only the catalog needs http or a
manual import. This was raised against the guide's single-file argument and
accepted.

---

## 2. Project model and persistence

One JSON document:

```json
{
  "schema": 1,
  "scene": { "nvrs": [], "cameras": [], "occluders": [], "prop": [], "fence": {}, "settings": {} },
  "catalogSnapshot": { "nvrs": [], "cameras": [] }
}
```

`catalogSnapshot` holds only the entries the scene references, not the whole
catalog.

- **Autosave** to localStorage, debounced.
- **Export / Import** writes and reads the same document as a file.
- The existing `PLAN v3` text format stays for the paste-to-share box. It
  round-trips geometry only and is unchanged.

### Migration

A scene with no `schema` field is today's format. Each camera's
`lens: 'ptz' | 'duo'` is migrated into a synthetic catalog entry built from its
`LENS` row, tagged source `legacy`, so the measured house keeps working and its
numbers stay explicable.

### Blank project

A new project starts with the current default scene: house, front porch, back
porch roof, deck, and a square property boundary, with the existing editors.

---

## 3. Scene graph and geometry

### Transforms

Every occluder gains `parent`, `pos` and `yaw`. A general local→world 4×4 is
composed up the parent chain; only yaw is exposed in the UI, so pitch and roll
can be added later as a UI change rather than an architecture change.

Intersection does **not** gain oriented-box code. `blocked()` and
`MESH.makeCaster` each transform the ray into the occluder's local frame and
call the existing slab test unchanged. The tested code survives verbatim and
the new wrapper is identical in both — which is exactly the mirroring the
developer guide requires of that pair.

Cycles are rejected when a parent is assigned.

### Shapes

`shape: 'box' | 'cyl'`.

- **box** — keeps four base and four top corner heights and its bilinear
  warped top. Still valid under yaw, which preserves z-up.
- **cyl** — radius, base z, top z. A tree is a trunk cylinder plus an ellipsoid
  canopy.

Ray–cylinder and ray–ellipsoid tests are added to `blocked()` and
`makeCaster` **in the same commit**. The mesh builder gains tessellated
cylinder and ellipsoid generation, so AO still has vertices to interpolate
across.

### Presets

The occluder `+` menu offers: building, sloped roof, column/post, fence, tree.
Each seeds a shape with sensible dimensions, corner heights and material.

### Cameras are world-absolute

A camera is a child of an NVR in the tree — a wiring relationship driving
channel limits, cost and stream budget — not a spatial parent. Mounting a
camera to a wall so it moves with the structure is explicitly out of scope.

---

## 4. Coverage model

Pixel density replaces the hardcoded per-lens range:

```
pxPerM(d) = resX / (2 · d · tan(fovH / 2))
```

Two tiers are kept, mapped onto EN 62676-4 (DORI):

- **face-ID tier** = identify, 250 px/m
- **detection tier** = recognise, 125 px/m

Both are then clamped by a max useful range, set by a scene-level day/night
toggle:

- **day** — the camera's optional catalog field `maxRangeFt`. When the field is
  absent the tier is governed by DORI alone, uncapped.
- **night** — `max(irFt, floodlightFt)`, and when both are zero or absent the
  camera contributes no coverage at night at all.

This is what makes the IR and floodlight stats meaningful rather than
decorative.

DORI's *detect* tier (25 px/m) is deliberately unused: at 3840 px over 88° it
reaches ~260 ft, which is meaningless outdoors at night.

Vertical FOV, occlusion, the PT sweep and the `quality()` / `blocked()` funnel
are unchanged.

### Expected movement in the numbers

The measured house reads 81% near-building coverage today under `r:40` and a
flat 20 ft face-ID line. Worked for the E1 (3840 px over 88°): identify lands
at ~26 ft and recognise at ~52 ft, so the figures will move. Before/after is
measured and recorded in the changelog rather than left to drift.

---

## 5. UI

### Layout

```
┌──────────────┬────────────────────────────┐
│ SCENE TREE   │  stage (plan / 3D / cams)  │
│  (resizable) │  mode buttons + layer strip│
├──────────────┤                            │
│ PROPERTIES   │                            │
│ (selected)   │                            │
├──────────────┴────────────────────────────┤
│ status bar                                │
└───────────────────────────────────────────┘
```

The left sidebar splits vertically — tree above, property editor for the
current selection below — both resizable, with sidebar width persisted. The
existing 340px right panel is removed and its contents redistribute:

- per-entity fields → property editor
- scene-wide settings (target height, draw mode, fence, presets, layout-code
  box) → property editor when the **Project** root node is selected
- frequently-flipped layer toggles → a compact strip over the stage

### Tree

```
Project
├── NVRs                    [+]
│   └── NVR                 [+]   → its cameras
├── Occluders               [+]   → nestable, drag to reparent
└── Property boundary
```

Each row carries a visibility eye (today's `on` flag), a name and one compact
stat. Occluders drag to reparent, with cycle rejection and a drop-to-root
target for flattening.

### Add menu

One component, parameterised by entity kind. Search box, filter chips, sort
control.

- **NVR**: sort by cost / channels / storage / name.
- **Camera**: chips for compatible-with-my-NVRs (on by default), PoE, WiFi,
  resolution, price band; sort by cost / resolution / identify-range / name.
- **Occluder**: a simple preset grid, no search.

### Status bar

NVR count, camera count, total cost, coverage **static and swept** (the
existing `qual()` and `swept()` pair, shown together), total storage capacity,
and estimated recording days.

### FPS and quality

Resolved camera value → NVR value → default. Inherited values render greyed in
the property editor so overrides are obvious. Setting the value on an NVR
applies to all its cameras that have not overridden it.

PT circuit editing (stops, dwell, playback) stays in the camera property
editor.

### Recording duration

Continuous recording is assumed:

```
bitrate ≈ pixels × fps × bpp(quality, codec)
```

summed across cameras against total capacity. The `bpp` constants are an
estimate and are stated as such in the UI. Motion-only recording would apply a
duty factor that is not modelled.

---

## 6. Source organisation

Source splits into `src/*.js` by section — `gl`, `mesh`, `coverage`,
`catalog`, `tree-ui`, `props-ui` — concatenated into a single self-contained
`index.html` by a build step. The Pages workflow runs the build before staging
`_site/`, so the published artifact remains one file.

This changes a claim the developer guide makes emphatically, so
`DEVELOPER_GUIDE.md` is updated in the same release to describe the build and
say why the single-file rule now applies to the *artifact* rather than the
*source*.

### Coverage recompute

A coarse pass runs immediately for responsiveness (reusing the existing
`coarse` flag), and the full pass runs in a **web worker** once interaction
settles. The previous value renders dimmed while a pass is in flight.

The worker does not become a third copy of the occlusion code: with a module
build, `coverage.js` is one source file bundled into both the page and the
worker.

---

## 7. Verification

There is no test suite, and the guide records that reasoning about correctness
failed where Playwright succeeded. Playwright is installed into a scratch venv
and drives the page for:

1. **Transform correctness** — a yawed box blocks the same rays as its
   unrotated equivalent with the ray rotated about the same axis.
2. **`blocked()` vs `makeCaster` agreement** — a sampled ray set across box,
   cylinder and ellipsoid must agree between the two implementations. This is
   the check that matters most; the guide states this divergence fails
   silently.
3. **DORI ranges** — computed identify/recognise distances against hand
   arithmetic for known resolution/FoV pairs.
4. **Catalog resolution** — variant retention on differing stats, collapse on
   byte-identical duplicates, user-file merge.
5. **Persistence** — localStorage autosave and export/import round-trip.
6. **Regression** — mesh vertex count, AO range, and GL context count per POV
   cell, which are the existing measured invariants.

Chromium is launched with `--use-gl=swiftshader --enable-unsafe-swiftshader`
for WebGL in headless.

---

## Decisions taken during brainstorming

| Question | Decision |
|---|---|
| Sequencing | One spec, one build (staged delivery declined) |
| Catalog data provenance | Researched from published specs, each entry dated |
| Occluder parenting | Full transforms |
| Rotation | General pipeline, yaw exposed now |
| New primitives | Presets plus a real cylinder primitive |
| Range model | Derived from resolution, two tiers on DORI |
| Catalog delivery | Fetched at runtime, copy embedded in the project |
| Stat conflicts | Keep both as variants |
| Offline blank project | Empty picker with import prompt |
| Source layout | Modules built into one file |
| Recompute | Coarse immediately, full pass in a worker |

## Out of scope

- Mounting cameras to structures so they move with them
- Motion-only recording duty factor
- Pitch and roll in the occluder UI
- Per-pixel GL vs ray-cast equivalence (still open from the previous release)
