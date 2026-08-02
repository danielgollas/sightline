// Concatenates src/*.js into src/index.template.html and writes index.html.
//
// The published artifact stays one self-contained file with no imports and no
// sibling fetches - that property is why this project shipped as a single file
// in the first place. What changed is that the *source* is now navigable; the
// artifact is not. See DEVELOPER_GUIDE.md.
//
// The equipment catalog is deliberately NOT inlined: it is fetched at runtime
// and a copy travels inside each saved project, so a scene is self-describing
// even where the fetch cannot succeed.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
const template = fs.readFileSync(path.join(SRC, 'index.template.html'), 'utf8');

// Strip exactly the one newline each module file ends with, and join with one
// newline. Anything more normalises blank lines the source deliberately has.
const body = manifest.modules
  .map(f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\n$/, ''))
  .join('\n');

if (!template.includes('/*MODULES*/')) {
  console.error('template is missing the /*MODULES*/ marker');
  process.exit(1);
}

const out = template.replace('/*MODULES*/', () => body);
const dest = process.argv[2] || path.join(ROOT, 'index.html');
fs.writeFileSync(dest, out);

console.log(`built ${dest} from ${manifest.modules.length} modules (${out.length} bytes)`);
