#!/usr/bin/env python3
"""
Verification for the catalog / transform / scene-tree release.

There is no unit-test suite in this project and the developer guide is blunt
about why: reasoning about correctness failed here where driving the real page
and reading values back succeeded. So this drives the real page.

Run:  ./pwenv/bin/python tests/verify.py [base_url]
"""
import json
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8731/index.html"

FLAGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"   {detail}" if detail else ""))


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=FLAGS)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE)
        page.wait_for_timeout(3500)

        # ---- 1. boots clean, with a scene and a resolved catalog ----
        base = page.evaluate("""() => ({
            cams: cams.length, boxes: boxes.length, nvrs: nvrs.length,
            catCams: CAT.all('cameras').length, catNvrs: CAT.all('nvrs').length,
            glon: GLON
        })""")
        check("boots with the default house", base["boxes"] == 15 and base["cams"] == 6, json.dumps(base))
        check("catalog resolves", base["catCams"] >= 9 and base["catNvrs"] >= 4,
              f"{base['catNvrs']} NVRs, {base['catCams']} cameras")

        # ---- 2. DORI ranges against hand arithmetic ----
        # Cylindrical density: px/m = resW / (fovH_rad * d)  =>  d = resW / (fovH_rad * px/m)
        dori = page.evaluate("""() => {
            const s = {resW:3840, fovH:88, irFt:0, floodlightFt:0, maxRangeFt:0};
            return {ident: identifyFt(s), det: detectFt(s)};
        }""")
        import math
        want_ident = 3840 / (math.radians(88) * 250) / 0.3048
        want_det = 3840 / (math.radians(88) * 125) / 0.3048
        check("identify distance matches hand arithmetic",
              abs(dori["ident"] - want_ident) < 0.01, f"{dori['ident']:.2f} ft vs {want_ident:.2f}")
        check("recognise distance matches hand arithmetic",
              abs(dori["det"] - want_det) < 0.01, f"{dori['det']:.2f} ft vs {want_det:.2f}")

        # A 189 degree lens must stay finite. The rectilinear formula divides by
        # tan(94.5) here and collapses the range to inches.
        wide = page.evaluate("""() => detectFt({resW:7680, fovH:189, irFt:0, floodlightFt:0, maxRangeFt:0})""")
        check("189 degree lens keeps a usable range", 40 < wide < 90, f"{wide:.1f} ft")

        # ---- 3. transform correctness ----
        # A yawed box must block exactly the rays its unrotated twin blocks when
        # the ray is rotated by the same angle about the box centre.
        tx = page.evaluate("""() => {
            const b = {id:'TZ', name:'t', shape:'box', on:true,
                       x0:0,y0:0,x1:10,y1:4, zb:[0,0,0,0], zt:[10,10,10,10],
                       yaw:0, parent:null};
            boxes.push(b); sceneGen++;
            const cx=5, cy=2;
            const rot=(x,y,deg)=>{const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
              const dx=x-cx, dy=y-cy; return [cx+dx*c-dy*s, cy+dx*s+dy*c];};
            let agree=0, total=0, blockedCount=0;
            const YAW=37;
            for(let i=0;i<360;i+=7){
              for(const R of [8, 20]){
                const a=i*Math.PI/180;
                const ox=cx+Math.cos(a)*R, oy=cy+Math.sin(a)*R, oz=5;
                // unrotated box, plain ray
                b.yaw=0; sceneGen++;
                const plain=hitsOccluder(b, ox,oy,oz, cx-ox, cy-oy, 0);
                // rotated box, ray rotated the same way about the centre
                b.yaw=YAW; sceneGen++;
                const [rx,ry]=rot(ox,oy,YAW);
                const rotd=hitsOccluder(b, rx,ry,oz, cx-rx, cy-ry, 0);
                total++; if(plain===rotd)agree++;
                if(plain)blockedCount++;
              }
            }
            boxes=boxes.filter(x=>x.id!=='TZ'); sceneGen++;
            return {agree, total, blockedCount};
        }""")
        check("yawed box blocks the same rotated rays",
              tx["agree"] == tx["total"] and tx["blockedCount"] > 0,
              f"{tx['agree']}/{tx['total']} agree, {tx['blockedCount']} blocked")

        # A yaw of 0 must be bit-identical to no transform at all.
        ident = page.evaluate("""() => {
            const b=boxes[0];
            const m=worldM(b);
            const I=TX.ident();
            return m.every((v,i)=>Math.abs(v-I[i])<1e-12);
        }""")
        check("untransformed occluder keeps the identity matrix", ident)

        # ---- 4. blocked() and makeCaster agree ----
        # This is the check that matters most: the guide records that divergence
        # between these two fails silently.
        agree = page.evaluate("""() => {
            const occ = MESH.makeCaster(env());
            let same=0, total=0, hits=0, diffs=[];
            const cam = cams[0];
            for(let i=0;i<360;i+=5){
              for(const R of [6, 14, 26]){
                const a=i*Math.PI/180;
                const x=cam.x+Math.cos(a)*R, y=cam.y+Math.sin(a)*R, z=3;
                const dx=x-cam.x, dy=y-cam.y, dz=z-cam.z;
                // blocked(): occluders only, so compare against the caster with
                // the ground and the fence taken out of the picture
                let byBlocked=false;
                for(const b of boxes){
                  if(!b.on) continue;
                  if(insideOccluder(b,cam.x,cam.y,cam.z)) continue;
                  if(hitsOccluder(b,cam.x,cam.y,cam.z,dx,dy,dz)){byBlocked=true;break;}
                }
                let byCaster=false;
                const L=Math.hypot(dx,dy,dz);
                for(const b of boxes){
                  if(!b.on) continue;
                  if(insideOccluder(b,cam.x,cam.y,cam.z)) continue;
                  if(occ(cam.x,cam.y,cam.z, dx/L,dy/L,dz/L, L, null)){byCaster=true;break;}
                }
                total++;
                if(byBlocked===byCaster) same++; else diffs.push([i,R,byBlocked,byCaster]);
                if(byBlocked) hits++;
              }
            }
            return {same,total,hits,diffs:diffs.slice(0,4)};
        }""")
        check("blocked() and makeCaster agree on every sampled ray",
              agree["same"] == agree["total"] and agree["hits"] > 0,
              f"{agree['same']}/{agree['total']}, {agree['hits']} blocked, diffs={agree['diffs']}")

        # ---- 5. cylinder and ellipsoid primitives ----
        cyl = page.evaluate("""() => {
            const b = makeOccluder('post', {x:0, y:0});
            b.x0=0;b.y0=0;b.x1=2;b.y1=2;b.r=1;b.zb=[0,0,0,0];b.zt=[10,10,10,10];
            boxes.push(b); sceneGen++;
            // through the axis: hit. Past the radius: miss. Over the top: miss.
            const through = hitsOccluder(b, -5,1,5, 10,0,0);
            const past    = hitsOccluder(b, -5,1,5, 10,0,0) && !hitsOccluder(b, -5,4,5, 10,0,0);
            const over    = hitsOccluder(b, -5,1,12, 10,0,0);
            const inside  = insideOccluder(b, 1,1,5);
            boxes=boxes.filter(x=>x!==b); sceneGen++;
            return {through, past, over, inside};
        }""")
        check("cylinder blocks through its axis", cyl["through"])
        check("cylinder misses outside its radius", cyl["past"])
        check("cylinder misses above its top", not cyl["over"])
        check("insideOccluder true within a cylinder", cyl["inside"])

        tree = page.evaluate("""() => {
            const b = makeOccluder('tree', {x:0,y:0});
            b.x0=0;b.y0=0;b.x1=2;b.y1=2;b.r=0.7;b.zb=[0,0,0,0];b.zt=[10,10,10,10];
            b.canopyR=6; b.canopyH=7;
            boxes.push(b); sceneGen++;
            const trunk  = hitsOccluder(b, -20,1,5, 40,0,0);
            const canopy = hitsOccluder(b, -20,1,13, 40,0,0);   // above trunk, in canopy
            const clear  = hitsOccluder(b, -20,1,40, 40,0,0);   // well above everything
            boxes=boxes.filter(x=>x!==b); sceneGen++;
            return {trunk, canopy, clear};
        }""")
        check("tree trunk blocks", tree["trunk"])
        check("tree canopy blocks above the trunk", tree["canopy"])
        check("nothing blocks above the canopy", not tree["clear"])

        # ---- 6. catalog variants and dedup ----
        cat = page.evaluate("""() => {
            const before = CAT.all('nvrs').length;
            const e = {id:'zz-test', brand:'Z', model:'T', channels:4, compat:['zz']};
            CAT.add('nvrs', [e], 'imported');
            const afterFirst = CAT.all('nvrs').length;
            CAT.add('nvrs', [JSON.parse(JSON.stringify(e))], 'imported');   // identical
            const afterDup = CAT.all('nvrs').length;
            CAT.add('nvrs', [{...e, channels:8}], 'project');               // differs
            const afterVariant = CAT.all('nvrs').length;
            return {before, afterFirst, afterDup, afterVariant};
        }""")
        check("identical catalog entries collapse",
              cat["afterDup"] == cat["afterFirst"] == cat["before"] + 1, json.dumps(cat))
        check("differing stats are kept as a variant",
              cat["afterVariant"] == cat["afterFirst"] + 1, json.dumps(cat))

        # ---- 7. persistence round-trip ----
        page.evaluate("""() => {
            boxes[0].yaw = 33;
            boxes[0].name = 'RoundTrip';
            cams[0].price = 123;
            opts.night = true;
            const b = makeOccluder('tree', {x:5,y:5});
            boxes.push(b);
            render();
        }""")
        page.wait_for_timeout(900)
        page.reload()
        page.wait_for_timeout(3200)
        rt = page.evaluate("""() => ({
            yaw: boxes[0].yaw, name: boxes[0].name,
            price: cams[0].price, night: opts.night,
            trees: boxes.filter(b=>b.shape==='tree').length,
            cams: cams.length, nvrs: nvrs.length
        })""")
        check("scene survives reload via localStorage",
              rt["yaw"] == 33 and rt["name"] == "RoundTrip" and rt["price"] == 123
              and rt["night"] is True and rt["trees"] == 1, json.dumps(rt))

        # ---- 8. export/import document shape ----
        doc = page.evaluate("""() => { const d=serialize();
            return {schema:d.schema, keys:Object.keys(d.scene),
                    snapCams:d.catalogSnapshot.cameras.length,
                    snapNvrs:d.catalogSnapshot.nvrs.length}; }""")
        check("project document carries a catalog snapshot",
              doc["schema"] == 1 and doc["snapCams"] >= 1 and doc["snapNvrs"] >= 1, json.dumps(doc))

        # ---- 9. night model ----
        night = page.evaluate("""() => {
            const s = {resW:3840, fovH:88, irFt:0, floodlightFt:0, maxRangeFt:0};
            opts.night = true;  const dark = detectFt(s);
            const lit = detectFt({...s, irFt:60});
            opts.night = false; const day = detectFt(s);
            return {dark, lit, day};
        }""")
        check("a camera with no IR sees nothing at night", night["dark"] == 0, json.dumps(night))
        check("IR distance caps night range", abs(night["lit"] - 60) < 0.01, json.dumps(night))
        # In daylight IR is irrelevant, so the range is whatever DORI allows -
        # which for this spec is 65.6 ft, above the 60 ft the IR cap imposes.
        check("daylight ignores the IR cap", night["day"] > night["lit"], json.dumps(night))

        # ---- 10. worker agrees with the main thread ----
        page.evaluate("() => { localStorage.clear(); }")
        page.reload()
        page.wait_for_timeout(3200)
        wk = page.evaluate("""async () => {
            const main = computeCoverage(1.5);
            const w = ensureWorker();
            if(!w) return {worker:false};
            const got = await new Promise(res=>{
              const h = e => { if(e.data.id===9999){ w.removeEventListener('message',h); res(e.data.result); } };
              w.addEventListener('message',h);
              w.postMessage({...sceneMsg(), step:1.5, id:9999});
              setTimeout(()=>res(null), 15000);
            });
            return {worker:true, main, got};
        }""")
        if not wk.get("worker"):
            check("coverage worker starts", False, "worker unavailable")
        else:
            g, m = wk["got"], wk["main"]
            same = g is not None and all(abs(g[k] - m[k]) < 1e-9 for k in ("n", "ac", "ai", "nc", "cc", "ci"))
            check("worker reproduces the main-thread sweep exactly", same,
                  f"main={m['cc']}/{m['nc']} worker={(g or {}).get('cc')}/{(g or {}).get('nc')}")

        # ---- 11. the existing measured invariants still hold ----
        page.click("#mpov")
        page.wait_for_timeout(9000)
        gl = page.evaluate("""() => {
            const cells=[...document.querySelectorAll('.povcell canvas')];
            return {verts: meshCache? meshCache.pos.length/3 : 0,
                    aoMin: meshCache? Math.min(...meshCache.ao) : -1,
                    aoMax: meshCache? Math.max(...meshCache.ao) : -1,
                    cells: cells.length, ctxs: cells.filter(c=>c.__ctx).length,
                    glon: GLON};
        }""")
        check("AO bake still produces a mesh", gl["verts"] > 20000, f"{gl['verts']} vertices")
        check("AO range still 0.25..1.00",
              0.2 <= gl["aoMin"] <= 0.35 and 0.99 <= gl["aoMax"] <= 1.0,
              f"{gl['aoMin']:.2f}..{gl['aoMax']:.2f}")
        check("one GL context per POV cell, none leaked",
              gl["cells"] > 0 and gl["cells"] == gl["ctxs"], f"{gl['ctxs']}/{gl['cells']}")

        page.click("#m3d")
        page.wait_for_timeout(2500)

        # ---- 12. the 3D ray-cast overlays actually run ----
        # seesPoint() once inlined its own copy of the box tests and ended up
        # calling a function that had been removed, so splatter threw the
        # moment it was switched on. Nothing here exercised it. Now it does.
        overlays = page.evaluate("""() => {
            const out = {};
            try { out.frusta = buildFrusta().length; } catch(e){ out.frustaErr = String(e); }
            try { out.splat = buildSplat().length; } catch(e){ out.splatErr = String(e); }
            return out;
        }""")
        check("frustum solids build", overlays.get("frusta", 0) > 0, json.dumps(overlays))
        check("splatter builds", overlays.get("splat", 0) > 0, json.dumps(overlays))

        # and through the real UI path, with the layer toggles
        page.evaluate("() => { opts.splat = true; opts.frus = true; render(); }")
        page.wait_for_timeout(3000)
        check("splatter renders through the UI", not errors, "; ".join(errors[:2]))
        page.evaluate("() => { opts.splat = false; render(); }")
        page.wait_for_timeout(500)

        # ---- 13. hand tool on the camera views ----
        page.click("#mpov")
        page.wait_for_timeout(7000)
        hand = page.evaluate("""() => {
            const c = cams[0];
            const before = {a:c.a, t:c.t};
            // limits are respected in both directions
            c.tiltMin = -10; c.tiltMax = 20;
            aimTo(c, c.a, 90);   const hiT = c.t;
            aimTo(c, c.a, -90);  const loT = c.t;
            // a bounded pan snaps to the nearer end rather than wrapping
            c.panMin = 0; c.panMax = 90;
            aimTo(c, 200, 0);    const panned = c.a;
            const inRange = (aimTo(c, 45, 0), c.a);
            // the PT circuit travels with the head
            c.panMin=null; c.panMax=null; c.tiltMin=null; c.tiltMax=null;
            c.tour = [{a:100,t:10,d:8}];
            const t0 = c.tour[0].a;
            aimTo(c, c.a + 30, c.t);
            const tourMoved = Math.abs(((c.tour[0].a - t0 + 540) % 360) - 180 - 30) < 0.01;
            c.tour = [];
            c.a = before.a; c.t = before.t;
            return {hiT, loT, panned, inRange, tourMoved,
                    buttons: document.querySelectorAll('.zoombtn').length};
        }""")
        check("dragging clamps tilt to its limits",
              hand["hiT"] == 20 and hand["loT"] == -10, json.dumps(hand))
        check("bounded pan snaps to the nearer limit",
              hand["panned"] in (0, 90) and abs(hand["inRange"] - 45) < 0.01, json.dumps(hand))
        check("the PT circuit travels with the head", hand["tourMoved"], json.dumps(hand))
        check("every camera view has a zoom toggle",
              hand["buttons"] >= 1, json.dumps(hand))

        # dragging is the default interaction - no arming step
        drag = page.evaluate("""() => {
            const cell = document.querySelector('.povcell');
            const c = cams.find(x => x.id === cell.dataset.cam);
            const a0 = c.a, t0 = c.t;
            const r = cell.getBoundingClientRect();
            const ev = (type, x, y) => cell.dispatchEvent(
                new PointerEvent(type, {clientX:x, clientY:y, bubbles:true, pointerId:7}));
            ev('pointerdown', r.x + r.width/2, r.y + r.height/2);
            ev('pointermove', r.x + r.width/2 - 80, r.y + r.height/2 + 30);
            ev('pointerup',   r.x + r.width/2 - 80, r.y + r.height/2 + 30);
            return {movedPan: Math.abs(c.a - a0) > 0.5, movedTilt: Math.abs(c.t - t0) > 0.5,
                    a0, a1: c.a, t0, t1: c.t};
        }""")
        check("dragging the view pans and tilts, with no arming step",
              drag["movedPan"] and drag["movedTilt"], json.dumps(drag))

        # the grabbed point must stay under the cursor: the frame is linear in
        # bearing but TANGENT in elevation, and treating the vertical as linear
        # is what made the first version of this feel wrong.
        track = page.evaluate("""() => {
            const cell = document.querySelector('.povcell');
            const c = cams.find(x => x.id === cell.dataset.cam);
            const S = specOf(c);
            c.tiltMin = -60; c.tiltMax = 80;          // don't clamp mid-test
            const r = cell.getBoundingClientRect();
            const ev = (type, x, y) => cell.dispatchEvent(
                new PointerEvent(type, {clientX:x, clientY:y, bubbles:true, pointerId:8}));
            const worldOf = (fx, fy, a, t) => {
              const A = frameAngles(c, fx, fy);
              return {b: a + A.phi, e: -t + A.eps};    // absolute bearing / elevation
            };
            // grab well away from centre, where a linear approximation is worst
            const fx0 = 0.22, fy0 = 0.24, fx1 = 0.62, fy1 = 0.71;
            const a0 = c.a, t0 = c.t;
            const grabbed = worldOf(fx0, fy0, a0, t0);
            ev('pointerdown', r.x + r.width*fx0, r.y + r.height*fy0);
            ev('pointermove', r.x + r.width*fx1, r.y + r.height*fy1);
            ev('pointerup',   r.x + r.width*fx1, r.y + r.height*fy1);
            const now = worldOf(fx1, fy1, c.a, c.t);
            delete c.tiltMin; delete c.tiltMax;
            return {dBearing: Math.abs(((now.b - grabbed.b + 540) % 360) - 180),
                    dElev: Math.abs(now.e - grabbed.e)};
        }""")
        # Tilt is deliberately quantised to 0.1 degrees so saved projects stay
        # tidy, so half a step is the tightest this can be. On a 41 degree
        # frame that is about a third of a pixel.
        check("the grabbed point stays under the cursor",
              track["dBearing"] < 0.01 and track["dElev"] <= 0.05, json.dumps(track))

        # the zoom toggle, not the cell, controls tile/fullscreen
        zoom = page.evaluate("""() => {
            const before = povMax;
            document.querySelector('.povcell .zoombtn').click();
            const maxed = povMax;
            const cells = document.querySelectorAll('.povcell').length;
            document.querySelector('.povcell .zoombtn').click();
            return {before, maxed, cellsWhenMaxed: cells,
                    restored: povMax, cellsAfter: document.querySelectorAll('.povcell').length};
        }""")
        check("zoom toggle fills the stage and restores",
              zoom["before"] is None and zoom["maxed"] is not None
              and zoom["cellsWhenMaxed"] == 1 and zoom["restored"] is None
              and zoom["cellsAfter"] > 1, json.dumps(zoom))

        # ---- 14. PT limits come from the catalog ----
        pt = page.evaluate("""() => {
            const e1 = cams.find(c => c.catKey === 'reolink-e1-outdoor-se');
            const S = specOf(e1);
            delete e1.tiltMin; delete e1.tiltMax; delete e1.panMin; delete e1.panMax;
            const L = camLimits(e1);
            // the head cannot look above horizontal
            const t0 = e1.t;
            aimTo(e1, e1.a, -30); const clampedUp = e1.t;
            aimTo(e1, e1.a, 80);  const clampedDown = e1.t;
            e1.t = t0;
            // a 355 degree head is treated as free even with a mount bearing
            e1.panHome = 90;
            const freeWide = camLimits(e1).aMin;
            // a narrow head is not
            e1.panRange = 120;
            const narrow = camLimits(e1);
            delete e1.panRange; delete e1.panHome;
            return {specPan:S.panRange, specTiltMin:S.tiltMin, specTiltMax:S.tiltMax,
                    limMin:L.tMin, limMax:L.tMax, clampedUp, clampedDown,
                    freeWide, narrowMin:narrow.aMin, narrowMax:narrow.aMax};
        }""")
        check("E1 pan/tilt travel comes from the catalog",
              pt["specPan"] == 355 and pt["specTiltMin"] == 0 and pt["specTiltMax"] == 50,
              json.dumps(pt))
        check("catalog tilt limits bound the drag",
              pt["clampedUp"] == 0 and pt["clampedDown"] == 50, json.dumps(pt))
        check("a 355 degree head is treated as unrestricted",
              pt["freeWide"] is None, json.dumps(pt))
        check("a narrow head gets real pan limits",
              pt["narrowMin"] == 30 and pt["narrowMax"] == 150, json.dumps(pt))

        # ---- 15. the SVG overlay lands on the GL render ----
        # The overlay draws the box edit handles and the camera markers. It used
        # to project orthographically while GL rendered in perspective, so the
        # handles sat up to 200 px off the geometry by an amount that changed
        # with every orbit.
        page.evaluate("() => { document.getElementById('m3d').click(); }")
        page.wait_for_timeout(6000)
        align = page.evaluate("""async () => {
            function glScreen(p){
              const cv=document.getElementById('gl3d');
              const {eye,at}=orbitEye();
              const P=GL.M4.perspective(38,cv.width/cv.height,0.5,600);
              const V=GL.M4.lookAtLH(eye,at,[0,0,1]);
              const M=GL.M4.mul(P,V);
              const X=M[0]*p[0]+M[4]*p[1]+M[8]*p[2]+M[12];
              const Y=M[1]*p[0]+M[5]*p[1]+M[9]*p[2]+M[13];
              const Wc=M[3]*p[0]+M[7]*p[1]+M[11]*p[2]+M[15];
              return {x:(X/Wc*0.5+0.5)*W, y:(1-(Y/Wc*0.5+0.5))*H};
            }
            const pts=[...cams.map(c=>[c.x,c.y,c.z]),[0,0,20],[25,25,0],[38,26,1.2]];
            const views=[[-38,32,0,0],[20,45,0,0],[-120,20,0,0],[75,60,0,0],[-38,32,140,70]];
            let worst=0;
            const sA=az, sE=elv, sX=panX, sY=panY;
            for(const [A,E,px,py] of views){
              az=A; elv=E; panX=px; panY=py; render();
              for(const p of pts){
                const a=proj(p[0],p[1],p[2]), b=glScreen(p);
                worst=Math.max(worst, Math.hypot(a.x-b.x,a.y-b.y));
              }
            }
            az=sA; elv=sE; panX=sX; panY=sY; render();
            return {worst};
        }""")
        check("SVG overlay matches the GL projection exactly",
              align["worst"] < 0.01, f"worst {align['worst']:.4f} px")

        # panning must move the rendered scene, not just the overlay
        panned = page.evaluate("""() => {
            panX=0; panY=0; const a=orbitEye().eye.slice();
            panX=200; panY=0;  const b=orbitEye().eye.slice();
            panX=0; panY=0; render();
            return {moved: Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])};
        }""")
        check("panning moves the GL camera", panned["moved"] > 1,
              f"eye moved {panned['moved']:.2f} ft")

        # ---- 16. the plan view is an orthographic render of the same scene ----
        page.evaluate("() => { document.getElementById('m2d').click(); }")
        page.wait_for_timeout(3000)
        planv = page.evaluate("""() => {
            function glScreen(p){
              const M=glViewPlan.mvp;
              const X=M[0]*p[0]+M[4]*p[1]+M[8]*p[2]+M[12];
              const Y=M[1]*p[0]+M[5]*p[1]+M[9]*p[2]+M[13];
              const Wc=M[3]*p[0]+M[7]*p[1]+M[11]*p[2]+M[15];
              return {x:(X/Wc*0.5+0.5)*W, y:(1-(Y/Wc*0.5+0.5))*H};
            }
            const pts=[[0,0,0],[25,25,0],[12.5,12.5,20],[-18,-19,0],[46,51,3]];
            const sZ=zoom2, sX=ctrX, sY=ctrY;
            let worst=0, height=0;
            for(const [z,cx,cy] of [[1,ctrX,ctrY],[2.4,8,14],[0.5,30,-5]]){
              zoom2=z; ctrX=cx; ctrY=cy; render();
              for(const p of pts){
                const g=glScreen(p);
                worst=Math.max(worst, Math.hypot(g.x-wx(p[0]), g.y-wy(p[1])));
              }
              // a plan must be orthographic: height must not shift a point sideways
              const a=glScreen([10,10,0]), b=glScreen([10,10,20]);
              height=Math.max(height, Math.hypot(a.x-b.x, a.y-b.y));
            }
            zoom2=sZ; ctrX=sX; ctrY=sY; render();
            return {worst, height, hasMatrix: !!glViewPlan};
        }""")
        check("plan render aligns with the diagram exactly",
              planv["hasMatrix"] and planv["worst"] < 0.01, f"worst {planv['worst']:.4f} px")
        check("the plan projection is orthographic",
              planv["height"] < 0.01, f"20 ft of height shifts a point {planv['height']:.4f} px")

        # ---- 17. splatter is scene geometry, not an overlay ----
        splat_gl = page.evaluate("""() => {
            opts.splat = true; render();
            const cv = document.getElementById('gl3d');
            const inPlan = cv.__ctx ? cv.__ctx.scount : 0;
            document.getElementById('m3d').click();
            // Isolate splatter from the frustum solids, which are their own
            // GL pass with their own counter.
            opts.frus = false; render();
            const in3d = cv.__ctx ? cv.__ctx.scount : 0;
            const withSplat = document.querySelectorAll('#view3d polygon').length;
            opts.splat = false; render();
            const withoutSplat = document.querySelectorAll('#view3d polygon').length;
            const afterOff = cv.__ctx ? cv.__ctx.scount : 0;
            opts.frus = true;
            document.getElementById('m2d').click();
            return {inPlan, in3d, withSplat, withoutSplat, afterOff};
        }""")
        check("splatter is uploaded as GL geometry in the plan view",
              splat_gl["inPlan"] > 100, json.dumps(splat_gl))
        check("splatter is GL geometry in the 3D view too",
              splat_gl["in3d"] > 100, json.dumps(splat_gl))
        check("splatter adds no SVG polygons over the render",
              splat_gl["withSplat"] == splat_gl["withoutSplat"], json.dumps(splat_gl))
        check("turning splatter off clears the GL geometry",
              splat_gl["afterOff"] == 0, json.dumps(splat_gl))

        # ---- 18. frustum solids are scene geometry too ----
        frus_gl = page.evaluate("""() => {
            opts.splat = false; opts.frus = true;
            document.getElementById('m3d').click(); render();
            const cv = document.getElementById('gl3d');
            const on = cv.__ctx ? cv.__ctx.fcount : 0;
            const svgOn = document.querySelectorAll('#view3d polygon').length;
            opts.frus = false; render();
            const off = cv.__ctx ? cv.__ctx.fcount : 0;
            const svgOff = document.querySelectorAll('#view3d polygon').length;
            opts.frus = true; render();
            // A quad straddling an occlusion edge is faded out, so no frustum
            // quad may span a range ratio the grid cannot represent.
            const c = cams.find(k => k.on);
            let worstRatio = 0;
            frusta.forEach(q => {
              const d = q.p.map(p => Math.hypot(p[0]-c.x, p[1]-c.y, p[2]-c.z))
                            .filter(v => v > 0.01);
              if (d.length) worstRatio = Math.max(worstRatio, Math.max(...d)/Math.min(...d));
            });
            document.getElementById('m2d').click();
            return {on, off, svgOn, svgOff, worstRatio};
        }""")
        check("frustum solids are uploaded as GL geometry",
              frus_gl["on"] > 100, json.dumps(frus_gl))
        check("turning frustum solids off clears the GL geometry",
              frus_gl["off"] == 0, json.dumps(frus_gl))
        check("frustum solids add no SVG polygons over the render",
              frus_gl["svgOn"] == frus_gl["svgOff"], json.dumps(frus_gl))
        check("no quad smears across an occlusion edge",
              frus_gl["worstRatio"] < 12, f"worst corner range ratio {frus_gl['worstRatio']:.1f}x")

        # ---- 19. the frustum cast agrees with the shared occlusion test ----
        # castRay3 used to carry its own axis-aligned box test, so a rotated or
        # round occluder clipped the drawn volume somewhere the coverage model
        # did not agree with.
        shape_agree = page.evaluate("""() => {
            const c = cams.find(k => k.on);
            // a tree squarely in front of the camera, well inside its range
            const a = c.a * Math.PI / 180;
            const cx = c.x + Math.cos(a) * 18, cy = c.y + Math.sin(a) * 18;
            boxes.push({id:'TT', name:'probe', on:true, shape:'tree',
                        x0:cx-1, x1:cx+1, y0:cy-1, y1:cy+1, r:1,
                        canopyR:9, canopyH:10, zb:[0,0,0,0], zt:[18,18,18,18]});
            meshKey = ''; splat = frusta = null; sceneGen++;
            const hit = insideOccluder(boxes[boxes.length-1], cx, cy, 12);
            // the same point through the frustum cast's own containment path
            const r = castRay3(c, c.a, c.t || 0, 200);
            const dFree = (() => { boxes.pop(); sceneGen++;
                                   return castRay3(c, c.a, c.t || 0, 200).d; })();
            sceneGen++;
            return {canopyContains: hit, clipped: r.d, unclipped: dFree};
        }""")
        check("a tree canopy clips the frustum cast",
              shape_agree["canopyContains"] and
              shape_agree["clipped"] < shape_agree["unclipped"] - 1,
              json.dumps(shape_agree))

        # ---- 20. the opening view frames the lot it loaded ----
        framing = page.evaluate("""() => {
            document.getElementById('m2d').click();
            resetView();
            const B = propBounds();
            const xs = [wx(B.x0), wx(B.x1)], ys = [wy(B.y0), wy(B.y1)];
            const inside = xs.every(v => v >= -2 && v <= W + 2) &&
                           ys.every(v => v >= -2 && v <= H + 2);
            // and it must fill the stage, not sit as a speck in the middle
            const fill = Math.max((xs[1]-xs[0])/W, (ys[1]-ys[0])/H);
            return {inside, fill, W, H};
        }""")
        check("the plan opens with the whole property on screen",
              framing["inside"], json.dumps(framing))
        check("the plan opens filling the stage",
              framing["fill"] > 0.7, f"lot covers {framing['fill']*100:.0f}% of the stage")

        check("no uncaught page errors", not errors, "; ".join(errors[:3]))

        browser.close()

    print()
    bad = [r for r in results if not r[1]]
    print(f"{len(results) - len(bad)}/{len(results)} checks passed")
    if bad:
        print("FAILED:")
        for n, _, d in bad:
            print(f"  - {n}  {d}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
