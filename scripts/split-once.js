// One-time source split. Slices the historical single-file index.html into
// src/*.js at the section markers that were already there, so the refactor is
// mechanical rather than retyped. Run once; build.js is the inverse.
//
// Verified by rebuilding and diffing against the original: byte-identical.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('\n');

// [name, firstLine, lastLine] - 1-indexed and inclusive, matching the numbers
// the section-marker comments sit on.
const SEGMENTS = [
  ['gl',        203, 446],
  ['mesh',      447, 680],
  ['util',      681, 704],
  ['state',     705, 827],
  ['occlusion', 828, 938],
  ['viewport',  939, 956],
  ['raster',    957, 984],
  ['cones',     985, 1030],
  ['plan',      1031, 1161],
  ['splat',     1162, 1240],
  ['frusta',    1241, 1303],
  ['materials', 1304, 1376],
  ['pov',       1377, 1679],
  ['view3d',    1680, 1827],
  ['glscene',   1828, 1919],
  ['render',    1920, 1995],
  ['interact',  1996, 2164],
  ['panel',     2165, 2377],
  ['codec',     2378, 2442],
  ['presets',   2443, 2485],
  ['anim',      2486, 2569],
];

const SCRIPT_OPEN = 200;   // <script>
const PREAMBLE_END = 202;  // "use strict"; plus the blank line after it
const SCRIPT_CLOSE = 2570; // </script>

const slice = (a, b) => src.slice(a - 1, b).join('\n');

fs.mkdirSync(path.join(ROOT, 'src'), { recursive: true });

let order = [];
for (const [name, from, to] of SEGMENTS) {
  fs.writeFileSync(path.join(ROOT, 'src', `${name}.js`), slice(from, to) + '\n');
  order.push(`${name}.js`);
}

// Everything outside the script block, with a marker where modules go.
const template =
  slice(1, SCRIPT_OPEN) + '\n' +
  slice(SCRIPT_OPEN + 1, PREAMBLE_END) + '\n' +
  '/*MODULES*/\n' +
  slice(SCRIPT_CLOSE, src.length);

fs.writeFileSync(path.join(ROOT, 'src', 'index.template.html'), template);
fs.writeFileSync(
  path.join(ROOT, 'src', 'manifest.json'),
  JSON.stringify({ modules: order }, null, 2) + '\n'
);

console.log(`split ${SEGMENTS.length} modules + template`);
