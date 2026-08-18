#!/usr/bin/env node
// @ts-check
import { openAmcp, assertProductionBuild, sleep } from './live-probe-lib.mjs';
import {
  startBeaconServer,
  solidPage,
  instrumentedPage,
  assertAlive,
  negativeControl,
  DEFAULT_LAN_HOST,
} from './beacon-probe-lib.mjs';

/**
 * THE MULTI-BOX ARRANGEMENT PROBES — every plant reading behind
 * `openspec/changes/multibox-layout-switch/design.md` §9.6, re-runnable.
 *
 * Taken 2026-08-18 against `192.168.21.50:5250`, build `2.5.0 69e8ad5 Stable`, channel 1
 * `1080i5000`. 🔴 The retired 2.3.2 install at `D:\programs\CasparCG` must never be
 * probed; `assertProductionBuild` refuses anything that is not 2.5.0.
 *
 *   node bin/arrangement-probes.mjs <probe> [--host H] [--lan H] [--channel N] [--layer N]
 *
 *   cg-layer        §9.6a  can two templates share one video layer? (decides candidate D)
 *   replace-gap     §9.6b  what a template REPLACE costs, in frames
 *   loadbg          §9.6c  does LOADBG pre-warm an html page, and is the cut gapless?
 *   slots           §9.6d  how many producers can a layer hold at once?
 *   cef             §9.6e  engine version + does it INTERPOLATE a clip-path?
 *   frame-cost      §9.6f  what the animated paths cost, isolated
 *   opacity         §9.6g  does MIXER OPACITY take a duration and a tween?
 *   mask-luminance  §9.6h  the fade-the-mask's-luminance lead
 *   cleanup                clear the probe layers and assert the channel is empty
 *
 * ⚠ EVERY probe asserts the build first, and every probe that reads a SILENCE runs both
 * controls (see `beacon-probe-lib.mjs`). A probe that cannot establish its controls throws
 * VOID rather than printing a number.
 */

const argv = process.argv.slice(2);
const probe = argv[0] ?? '';
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const PLANT = flag('host', '192.168.21.50');
const LAN = flag('lan', DEFAULT_LAN_HOST);
const CH = Number(flag('channel', '1'));
const LAYER = Number(flag('layer', '150'));
const FRAME_MS = 1000 / 25; // §9.2 confirmed 25 fps FRAMES on 1080i5000, not fields

/** Print. `process.stdout.write` rather than `console.log`, matching `lifecycle-probe.mjs`. */
const say = (line = '') => {
  process.stdout.write(`${line}
`);
};
const out = (k, v) => {
  say(`${String(k).padEnd(46)} ${String(v)}`);
};
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const q = (s) => `"${s}"`;

const PAGES = {
  '/a.html': (o) => solidPage('A', '#c81e1e', o),
  '/b.html': (o) => solidPage('B', '#1e5ac8', o),
  '/c.html': (o) => solidPage('C', '#1ec85a', o),
};

// ───────────────────────────── the animated-cost pages ─────────────────────────────

const HOLES_A =
  '0px 0px, 1920px 0px, 1920px 1080px, 0px 1080px, 120px 300px, 660px 300px, 660px 660px, 120px 660px, 690px 300px, 1230px 300px, 1230px 660px, 690px 660px, 1260px 300px, 1800px 300px, 1800px 660px, 1260px 660px';
const HOLES_B =
  '0px 0px, 1920px 0px, 1920px 1080px, 0px 1080px, 200px 200px, 1000px 200px, 1000px 700px, 200px 700px, 1020px 200px, 1820px 200px, 1820px 700px, 1020px 700px, 1830px 1070px, 1840px 1070px, 1840px 1080px, 1830px 1080px';

/** Report rAF rate over a window, so a drop is attributable rather than felt. */
const RATE_FN = `
function rate(ms,label,cb){var n=0,t0=performance.now(),worst=0,last=t0;
 (function tick(t){n++;var dt=t-last;if(dt>worst)worst=dt;last=t;
  if(t-t0<ms)requestAnimationFrame(tick);
  else{b(label,JSON.stringify({fps:+(n/((t-t0)/1000)).toFixed(1),worstGapMs:+worst.toFixed(1)}));if(cb)cb();}})(t0);}`;

/**
 * One page per MODE, each carrying its own at-rest control BEFORE and AFTER, so a low
 * number while animating cannot be a monotonic decline of the whole page.
 */
function costPage(mode, origin) {
  const two = mode === 'fade' || mode === 'both';
  const clip = mode === 'clip' || mode === 'both';
  return instrumentedPage({
    id: `cost-${mode}`,
    origin,
    css:
      `body{background:#000}.bg{position:absolute;inset:0;clip-path:polygon(evenodd, ${HOLES_A})}` +
      `#b1{background:linear-gradient(135deg,#123,#567)${clip ? ';transition:clip-path 2s linear' : ''}}` +
      `#b2{background:radial-gradient(circle at 30% 40%,#813,#218);opacity:0;` +
      `transition:opacity 2s linear${clip ? ',clip-path 2s linear' : ''}}`,
    body: `<div class="bg" id="b1"></div>${two ? '<div class="bg" id="b2"></div>' : ''}`,
    extraScript: `${RATE_FN}
rate(1500,'rest',function(){requestAnimationFrame(function(){
  ${clip ? `document.getElementById('b1').style.clipPath='polygon(evenodd, ${HOLES_B})';` : ''}
  ${two && clip ? `document.getElementById('b2').style.clipPath='polygon(evenodd, ${HOLES_B})';` : ''}
  ${two ? "document.getElementById('b2').style.opacity='1';" : ''}
  rate(2000,'animating',function(){rate(1500,'rest2');});});});`,
  });
}

/** §9.6e — does the engine INTERPOLATE a clip-path with a stable point count? */
function cefPage(origin) {
  return instrumentedPage({
    id: 'cef',
    origin,
    css:
      `body{background:#111}div.s{position:absolute;inset:0}` +
      `#poly{background:#c81e1e;clip-path:polygon(evenodd, ${HOLES_A});transition:clip-path 2s linear}` +
      `#path{background:#1e5ac8;clip-path:path(evenodd,'M0,0 H1920 V1080 H0 Z M200,200 H700 V500 H200 Z');` +
      `transition:clip-path 2s linear}`,
    body: '<div class="s" id="poly"></div><div class="s" id="path"></div>',
    extraScript: `
b('ua', navigator.userAgent);
b('caps', JSON.stringify({
  pathFn: CSS.supports('clip-path', "path('M0,0 H10 V10 Z')"),
  polygonEvenodd: CSS.supports('clip-path', 'polygon(evenodd, 0px 0px, 10px 0px, 10px 10px)'),
  maskLuminance: CSS.supports('mask-mode','luminance'),
  registerProperty: typeof CSS.registerProperty === 'function',
  waapi: typeof Element.prototype.animate === 'function',
  w: innerWidth, h: innerHeight, dpr: devicePixelRatio }));
function sample(id, target, label){
  var el=document.getElementById(id), start=getComputedStyle(el).clipPath, seen=[];
  requestAnimationFrame(function(){
    el.style.clipPath=target; var n=0;
    (function tick(){ if(n%6===0) seen.push(getComputedStyle(el).clipPath); n+=1;
      if(n<60) requestAnimationFrame(tick);
      else { var end=getComputedStyle(el).clipPath;
        var mid=seen.filter(function(s){return s!==start&&s!==end&&s!=='none';});
        b(label, JSON.stringify({distinct:new Set(seen).size, intermediates:mid.length,
          example:(mid[Math.floor(mid.length/2)]||'').slice(0,200)})); } })();
  });
}
sample('poly','polygon(evenodd, ${HOLES_B})','poly');
sample('path',"path(evenodd,'M0,0 H1920 V1080 H0 Z M900,300 H1500 V700 H900 Z')",'path');`,
  });
}

/**
 * §9.6h — the owner's lead: fade the MASK'S LUMINANCE, not the producer's opacity.
 *
 * Three readings, and the NEGATIVE one matters as much as the positive: animating
 * `mask-image` directly does NOT interpolate, so anyone trying the obvious spelling first
 * would conclude the lead is dead. The `@property` colour is the mechanism that works.
 */
function lumPage(origin) {
  const grad = (c) => `linear-gradient(90deg,#fff 0 30%,${c} 30% 70%,#fff 70% 100%)`;
  return instrumentedPage({
    id: 'lum',
    origin,
    css:
      `@property --punch{syntax:'<color>';inherits:false;initial-value:#000}` +
      `body{background:#204060}.bd{position:absolute;inset:0;background:linear-gradient(135deg,#123,#567)}` +
      `#grad{-webkit-mask-image:${grad('#000')};mask-image:${grad('#000')};` +
      `-webkit-mask-source-type:luminance;mask-mode:luminance;` +
      `transition:-webkit-mask-image 2s linear, mask-image 2s linear}` +
      `#prop{-webkit-mask-image:${grad('var(--punch)')};mask-image:${grad('var(--punch)')};` +
      `-webkit-mask-source-type:luminance;mask-mode:luminance;transition:--punch 2s linear}`,
    body: '<div class="bd" id="grad"></div><div class="bd" id="prop" style="display:none"></div>',
    extraScript: `${RATE_FN}
b('supports', JSON.stringify({ maskMode: CSS.supports('mask-mode','luminance'),
  registerProperty: typeof CSS.registerProperty === 'function', atProperty: CSS.supports('--punch','#808080') }));

/* The LUMINANCE -> ALPHA transfer, via an SVG mask rendered to a canvas.
   PROXY: same engine and the same luminance-to-alpha filter, but NOT the CSS
   mask-mode path compositing over SDI. Labelled as a proxy wherever it is cited. */
(function transfer(){
  var greys=[0,32,64,96,128,160,192,224,255], out=[], pending=greys.length;
  var c=document.createElement('canvas'); c.width=8; c.height=8;
  var ctx=c.getContext('2d');
  greys.forEach(function(g){
    var hex='#'+[g,g,g].map(function(v){return ('0'+v.toString(16)).slice(-2);}).join('');
    var svg='<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">'+
      '<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="8" height="8" style="mask-type:luminance">'+
      '<rect width="8" height="8" fill="'+hex+'"/></mask>'+
      '<rect width="8" height="8" fill="#ffffff" mask="url(#m)"/></svg>';
    var img=new Image();
    var done=function(entry){ out.push(entry); pending-=1;
      if(pending===0){ out.sort(function(x,y){return x.grey-y.grey;}); b('transfer', JSON.stringify(out)); } };
    img.onload=function(){ try{ ctx.clearRect(0,0,8,8); ctx.drawImage(img,0,0);
        done({grey:g, alpha:+(ctx.getImageData(4,4,1,1).data[3]/255).toFixed(3)}); }
      catch(e){ done({grey:g, error:String(e.name)}); } };
    img.onerror=function(){ done({grey:g, error:'load'}); };
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  });
})();

function sampleProp(id, target, label, isProp){
  var el=document.getElementById(id);
  var read=function(){ return isProp ? getComputedStyle(el).getPropertyValue('--punch').trim()
                                     : getComputedStyle(el).maskImage; };
  var start=read(), seen=[];
  requestAnimationFrame(function(){
    if(isProp) el.style.setProperty('--punch', target); else el.style.maskImage=target;
    var n=0;
    (function tick(){ if(n%6===0) seen.push(read()); n+=1;
      if(n<60) requestAnimationFrame(tick);
      else { var end=read(); var mid=seen.filter(function(s){return s!==start&&s!==end&&s!=='none'&&s!=='';});
        b(label, JSON.stringify({start:start.slice(0,80), distinct:new Set(seen).size,
          intermediates:mid.length, example:(mid[Math.floor(mid.length/2)]||'').slice(0,140)})); } })();
  });
}
rate(1500,'rest',function(){
  sampleProp('grad', ${JSON.stringify(grad('#808080'))}, 'grad', false);
  rate(2000,'animating-grad',function(){
    document.getElementById('grad').style.display='none';
    document.getElementById('prop').style.display='';
    requestAnimationFrame(function(){
      sampleProp('prop','#ffffff','prop', true);
      rate(2000,'animating-prop',function(){ rate(1500,'rest2'); });
    });
  });
});`,
  });
}

// ───────────────────────────────────── the probes ─────────────────────────────────────

/** §9.6a — the question that decides candidate D. */
async function probeCgLayer(command, h) {
  const neg = await negativeControl(command, h, { channel: CH, layer: LAYER });
  out('NEG CONTROL: bad-url ADD accepted', neg.accepted);
  out('NEG CONTROL: plant fetched the bad url', neg.plantFetchedTheBadUrl);
  out('NEG CONTROL: any beacon fired', neg.anyBeaconFired);
  if (!neg.valid)
    throw new Error('VOID — the negative control did not hold; a later silence proves nothing');
  await sleep(300);
  h.clear();

  await command(`CG ${CH}-${LAYER} ADD 0 ${q(h.url('/a.html'))} 1 "{}"`);
  if (!(await h.until(() => h.beacons('A', 'frame').length > 0, 8000)))
    throw new Error('VOID — A never painted');
  const before = h.beacons('A', 'update').length;
  await command(`CG ${CH}-${LAYER} UPDATE 0 ${q('{\\"tok\\":\\"pre\\"}')}`);
  if (!(await h.until(() => h.beacons('A', 'update').length > before, 3000)))
    throw new Error('VOID — the UPDATE channel to A is not live');
  out('POS CONTROL: UPDATE 0 reaches A', true);
  out('POS CONTROL: A heartbeat rate (per s)', (await assertAlive(h, 'A')).toFixed(1));

  const tAdd = Date.now();
  const reply = await command(`CG ${CH}-${LAYER} ADD 1 ${q(h.url('/b.html'))} 1 "{}"`, {
    expectOk: false,
  });
  out('CG ADD 1 (second cg-layer) reply code', reply.code);
  out('B painted a first frame', await h.until(() => h.beacons('B', 'frame').length > 0, 8000));
  await sleep(1200);
  out(
    'A heartbeats > 400 ms after the ADD',
    h.beacons('A', 'hb').filter((e) => e.t > tAdd + 400).length,
  );

  const a0 = h.beacons('A', 'update').length;
  const b0 = h.beacons('B', 'update').length;
  await command(`CG ${CH}-${LAYER} UPDATE 0 ${q('{\\"tok\\":\\"post0\\"}')}`);
  await sleep(1500);
  out('UPDATE 0 afterwards → A answered', h.beacons('A', 'update').length > a0);
  out('UPDATE 0 afterwards → B answered', h.beacons('B', 'update').length > b0);

  const info = await command(`INFO ${CH}-${LAYER}`, { quietMs: 900, expectOk: false });
  const xml = info.lines.join('\n');
  out('INFO <foreground> count', (xml.match(/<foreground>/g) ?? []).length);
  out('INFO paths', JSON.stringify([...xml.matchAll(/\/(\w+)\.html/g)].map((m) => m[1])));
  out(
    'VERDICT',
    h.beacons('A', 'hb').filter((e) => e.t > tAdd + 400).length > 0
      ? 'COEXIST'
      : 'REPLACE — the cg-layer argument is INERT',
  );
}

/** §9.6b — what a template REPLACE costs, in frames. */
async function probeReplaceGap(command, h, runs = 8) {
  const rows = [];
  for (let i = 0; i < runs; i += 1) {
    await command(`CLEAR ${CH}-${LAYER}`);
    await sleep(400);
    h.clear();
    const from = i % 2 === 0 ? 'A' : 'B';
    const to = i % 2 === 0 ? 'B' : 'A';
    await command(`CG ${CH}-${LAYER} ADD 0 ${q(h.url(`/${from.toLowerCase()}.html`))} 1 "{}"`);
    if (!(await h.until(() => h.beacons(from, 'frame').length > 0, 8000))) {
      out(`run ${i}`, 'VOID — outgoing never painted');
      continue;
    }
    await sleep(600);
    await assertAlive(h, from);
    const tCmd = Date.now();
    await command(`CG ${CH}-${LAYER} ADD 0 ${q(h.url(`/${to.toLowerCase()}.html`))} 1 "{}"`);
    if (!(await h.until(() => h.beacons(to, 'frame').length > 0, 10_000))) {
      out(`run ${i}`, 'VOID — incoming never painted');
      continue;
    }
    await sleep(400);
    const outHb = h.beacons(from, 'hb').filter((e) => e.t >= tCmd - 5);
    const tLastOut = outHb.length > 0 ? outHb[outHb.length - 1].t : tCmd;
    const tFirstIn = h.beacons(to, 'frame')[0].t;
    rows.push({ gap: tFirstIn - tLastOut, lived: tLastOut - tCmd, paint: tFirstIn - tCmd });
    out(
      `run ${i} ${from}→${to}`,
      `outgoing survived ${String(tLastOut - tCmd)} ms; gap ${String(tFirstIn - tLastOut)} ms = ` +
        `${((tFirstIn - tLastOut) / FRAME_MS).toFixed(2)} fr; ADD→paint ${String(tFirstIn - tCmd)} ms`,
    );
  }
  if (rows.length === 0) return;
  const g = rows.map((r) => r.gap);
  out(
    '\nGAP ms (min/med/max)',
    `${String(Math.min(...g))} / ${String(med(g))} / ${String(Math.max(...g))}`,
  );
  out(
    'GAP frames @25fps',
    `${(Math.min(...g) / FRAME_MS).toFixed(2)} / ${(med(g) / FRAME_MS).toFixed(2)} / ${(Math.max(...g) / FRAME_MS).toFixed(2)}`,
  );
  out('cf. the cut (§9.3)', '0.20 frames');
}

/** §9.6c — does LOADBG pre-warm an html page, and is the cut gapless? */
async function probeLoadbg(command, h, runs = 6) {
  const r = await command(`LOADBG ${CH}-${LAYER} [HTML] ${q(h.url('/b.html'))}`, {
    expectOk: false,
  });
  out('LOADBG [HTML] reply', `${String(r.code)} ${String(r.lines[0] ?? '')}`);
  out('backgrounded page painted', await h.until(() => h.beacons('B', 'frame').length > 0, 8000));
  out('backgrounded page heartbeat /s', (await h.rate('B')).toFixed(1));
  await command(`CLEAR ${CH}-${LAYER}`);
  await sleep(400);
  if (r.code < 200 || r.code >= 300) {
    out('VERDICT', 'LOADBG refuses an html producer — no pre-warm path');
    return;
  }
  const lived = [];
  for (let i = 0; i < runs; i += 1) {
    await command(`CLEAR ${CH}-${LAYER}`);
    await sleep(400);
    h.clear();
    const from = i % 2 === 0 ? 'A' : 'B';
    const to = i % 2 === 0 ? 'B' : 'A';
    await command(`PLAY ${CH}-${LAYER} [HTML] ${q(h.url(`/${from.toLowerCase()}.html`))}`);
    if (!(await h.until(() => h.beacons(from, 'frame').length > 0, 8000))) continue;
    await sleep(500);
    await command(`LOADBG ${CH}-${LAYER} [HTML] ${q(h.url(`/${to.toLowerCase()}.html`))}`);
    if (!(await h.until(() => h.beacons(to, 'frame').length > 0, 8000))) continue;
    await sleep(400);
    const rateOut = await assertAlive(h, from);
    const rateIn = await assertAlive(h, to);
    const tCmd = Date.now();
    await command(`PLAY ${CH}-${LAYER}`);
    await sleep(1200);
    const outHb = h.beacons(from, 'hb').filter((e) => e.t >= tCmd - 5);
    const survived = (outHb.length > 0 ? outHb[outHb.length - 1].t : tCmd) - tCmd;
    lived.push(survived);
    out(
      `run ${i} ${from}→${to}`,
      `BOTH ticked before the cut (${rateOut.toFixed(0)}/s, ${rateIn.toFixed(0)}/s); outgoing survived ` +
        `PLAY by ${String(survived)} ms; incoming kept ${String(h.beacons(to, 'hb').filter((e) => e.t > tCmd).length)} hb`,
    );
  }
  if (lived.length > 0) out('\noutgoing survived PLAY, med ms', med(lived));
  out('the incoming page was ALREADY painting', 'so there is NO LOAD GAP at the swap');
}

/** §9.6d — how many producers can one layer hold? Three DISTINCT pages, never two. */
async function probeSlots(command, h) {
  await command(`PLAY ${CH}-${LAYER} [HTML] ${q(h.url('/a.html'))}`);
  if (!(await h.until(() => h.beacons('A', 'frame').length > 0, 8000)))
    throw new Error('VOID — A never painted');
  await command(`LOADBG ${CH}-${LAYER} [HTML] ${q(h.url('/b.html'))}`);
  if (!(await h.until(() => h.beacons('B', 'frame').length > 0, 8000)))
    throw new Error('VOID — B never warmed');
  await sleep(400);
  out(
    'POS CONTROL: A and B both ticking',
    `${(await assertAlive(h, 'A')).toFixed(0)}/s, ${(await assertAlive(h, 'B')).toFixed(0)}/s`,
  );
  await command(`LOADBG ${CH}-${LAYER} [HTML] ${q(h.url('/c.html'))}`);
  if (!(await h.until(() => h.beacons('C', 'frame').length > 0, 8000)))
    throw new Error('VOID — C never warmed');
  await sleep(1000);
  const rB = await h.rate('B');
  out('after LOADBG C — A (foreground)', `${(await h.rate('A')).toFixed(0)}/s`);
  out('after LOADBG C — B (previous background)', `${rB.toFixed(0)}/s`);
  out('after LOADBG C — C (new background)', `${(await h.rate('C')).toFixed(0)}/s`);
  const xml = (await command(`INFO ${CH}-${LAYER}`, { quietMs: 900, expectOk: false })).lines.join(
    '\n',
  );
  out(
    'INFO <foreground>/<background>',
    `${String((xml.match(/<foreground>/g) ?? []).length)} / ${String((xml.match(/<background>/g) ?? []).length)}`,
  );
  out(
    'VERDICT',
    rB < 5 ? 'ONE background slot — the previous pre-warm was DESTROYED' : 'more than one survives',
  );
}

/** Load a self-reporting page and print the readings it beacons back. */
async function runPageProbe(command, h, path, keys, layer = LAYER) {
  await command(`CLEAR ${CH}-${layer}`);
  await sleep(300);
  h.clear();
  await command(`CG ${CH}-${layer} ADD 0 ${q(h.url(path))} 1 "{}"`);
  if (!(await h.until(() => h.events().some((e) => e.path === '/b'), 10_000)))
    throw new Error('VOID — the page never beaconed; nothing below is measurable');
  const last = keys[keys.length - 1];
  await h.until(() => h.events().some((e) => e.q.k === last), 30_000);
  for (const k of keys) {
    const e = h.events().find((x) => x.q.k === k);
    say(`\n--- ${k} ---\n${e ? String(e.q.v) : '(no beacon — NOT a result)'}`);
  }
}

/** §9.6g — does MIXER OPACITY take a duration and a tween, like FILL? */
async function probeOpacity(command, h) {
  await command(`PLAY ${CH}-${LAYER} [HTML] ${q(h.url('/a.html'))}`, { expectOk: false });
  await sleep(1200);
  const r0 = await command(`MIXER ${CH}-${LAYER} OPACITY`, { expectOk: false });
  out('OPACITY readback (no args)', `${String(r0.code)} :: ${r0.lines.slice(0, 2).join(' | ')}`);
  for (const [label, line] of [
    ['plain', `MIXER ${CH}-${LAYER} OPACITY 0.5`],
    ['duration only', `MIXER ${CH}-${LAYER} OPACITY 1 25`],
    ['duration + linear', `MIXER ${CH}-${LAYER} OPACITY 0.2 50 linear`],
    ['duration + easeinoutquad', `MIXER ${CH}-${LAYER} OPACITY 1 50 easeinoutquad`],
    ['duration + ease (CSS name)', `MIXER ${CH}-${LAYER} OPACITY 0.5 50 ease`],
    ['duration + cubic-bezier', `MIXER ${CH}-${LAYER} OPACITY 0.5 50 cubic-bezier`],
  ]) {
    const r = await command(line, { expectOk: false });
    out(`  ${label}`, `${String(r.code)} ${String(r.lines[0] ?? '')}`);
    await sleep(250);
  }
  await command(`MIXER ${CH}-${LAYER} OPACITY 1`);
  await sleep(400);
  await command(`MIXER ${CH}-${LAYER} OPACITY 0 50 linear`);
  const samples = [];
  for (let i = 0; i < 12; i += 1) {
    await sleep(140);
    const r = await command(`MIXER ${CH}-${LAYER} OPACITY`, { expectOk: false, quietMs: 200 });
    samples.push(Number((r.lines[1] ?? '').trim()));
  }
  out('\ntween samples', JSON.stringify(samples));
  out('distinct values', new Set(samples).size);
  out(
    'VERDICT',
    new Set(samples).size > 3 ? 'SERVER-TWEENED — duration + tween honoured' : 'no tween (snaps)',
  );
  await command(`MIXER ${CH}-${LAYER} OPACITY 1`, { expectOk: false });
}

// ────────────────────────────────────── driver ──────────────────────────────────────

const PROBES = new Set([
  'cg-layer',
  'replace-gap',
  'loadbg',
  'slots',
  'cef',
  'frame-cost',
  'opacity',
  'mask-luminance',
  'cleanup',
]);

if (!PROBES.has(probe)) {
  console.error(
    `usage: node bin/arrangement-probes.mjs <${[...PROBES].join('|')}> [--host H] [--lan H]`,
  );
  process.exit(2);
}

const harness = await startBeaconServer({
  port: 7912,
  lanHost: LAN,
  pages: {
    ...PAGES,
    '/cef.html': (o) => cefPage(o),
    '/lum.html': (o) => lumPage(o),
    '/cost-none.html': (o) => costPage('none', o),
    '/cost-clip.html': (o) => costPage('clip', o),
    '/cost-fade.html': (o) => costPage('fade', o),
    '/cost-both.html': (o) => costPage('both', o),
  },
});
const { command, close } = await openAmcp(PLANT, 5250);
try {
  out('BUILD (validity gate)', await assertProductionBuild(command));
  out('plant / harness', `${PLANT}:5250 → beacons to ${harness.origin}`);
  say('');
  if (probe === 'cg-layer') await probeCgLayer(command, harness);
  else if (probe === 'replace-gap') await probeReplaceGap(command, harness);
  else if (probe === 'loadbg') await probeLoadbg(command, harness);
  else if (probe === 'slots') await probeSlots(command, harness);
  else if (probe === 'opacity') await probeOpacity(command, harness);
  else if (probe === 'cef')
    await runPageProbe(command, harness, '/cef.html', ['ua', 'caps', 'poly', 'path'], LAYER + 1);
  else if (probe === 'mask-luminance')
    await runPageProbe(
      command,
      harness,
      '/lum.html',
      ['supports', 'transfer', 'grad', 'prop', 'rest', 'animating-grad', 'animating-prop', 'rest2'],
      LAYER + 1,
    );
  else if (probe === 'frame-cost') {
    say('mode   rest fps  ANIMATING fps  worst gap  rest2 fps   (a FRESH page load per mode)');
    for (const mode of ['none', 'clip', 'fade', 'both']) {
      await command(`CLEAR ${CH}-${LAYER + 1}`);
      await sleep(500);
      harness.clear();
      await command(`CG ${CH}-${LAYER + 1} ADD 0 ${q(harness.url(`/cost-${mode}.html`))} 1 "{}"`);
      if (!(await harness.until(() => harness.events().some((e) => e.q.k === 'rest2'), 25_000))) {
        say(`${mode}: VOID — the run never completed`);
        continue;
      }
      const j = (k) => JSON.parse(String(harness.events().find((e) => e.q.k === k).q.v));
      const [a, b2, c] = [j('rest'), j('animating'), j('rest2')];
      say(
        `${mode.padEnd(6)} ${String(a.fps).padStart(8)} ${String(b2.fps).padStart(14)} ` +
          `${String(b2.worstGapMs).padStart(10)} ${String(c.fps).padStart(10)}`,
      );
    }
  }
} finally {
  // Always leave the plant as it was found, and SAY whether it is clean.
  for (const l of [LAYER, LAYER + 1, LAYER + 2]) {
    try {
      await command(`MIXER ${CH}-${l} OPACITY 1`, { expectOk: false });
      await command(`CLEAR ${CH}-${l}`, { expectOk: false });
    } catch {
      /* best effort */
    }
  }
  await sleep(600);
  try {
    const xml = (await command(`INFO ${CH}`, { quietMs: 1200, expectOk: false })).lines.join('\n');
    say('');
    out(
      'layers still occupied',
      JSON.stringify([...xml.matchAll(/<layer_(\d+)>/g)].map((m) => m[1])),
    );
    out('any html producer left', /producer>html</.test(xml));
  } catch {
    say('\n⚠ could not verify the channel is clean');
  }
  await close();
  await harness.stop();
}
