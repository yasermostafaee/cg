import { randomUUID } from 'node:crypto';
import { TEMPLATE_PAGE_STATE_PATH } from '@cg/shared-schema';
import type { NormalizedRect } from './live-layers.js';

type Fit = { fill: NormalizedRect; clip: NormalizedRect };

type FocusPair = {
  colorClock?: number;
  matteClock?: number;
  startAt?: number;
};

type FocusPaint = {
  look: string;
  path: string;
  matte: boolean;
  pair?: FocusPair;
  done: () => void;
};

/** The focus page is an entire output raster. Transform that raster by the
 * same affine change as its native picture, including the picture's crop. */
export function focusArtworkFit(base: Fit, current: Fit): Fit | undefined {
  const width = current.fill.width / base.fill.width;
  const height = current.fill.height / base.fill.height;
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)))
    return undefined;
  return {
    fill: {
      x: current.fill.x - base.fill.x * width,
      y: current.fill.y - base.fill.y * height,
      width,
      height,
    },
    clip: current.clip,
  };
}

/** Copy the resident pass's complete raster/position URL; an independent sync
 * key prevents a backdrop look broadcast from retargeting this one plate. */
export function independentFocusPage(
  xml: string,
  layer: number,
  template: string,
  item: string,
  key: string,
): string | undefined {
  const entry = xml.split('<layer_' + layer + '>')[1]?.split('</layer_' + layer + '>')[0];
  const front = entry?.match(/<foreground>([\s\S]*?)<\/foreground>/)?.[1];
  if (!front?.includes('<producer>html</producer>')) return undefined;
  const path = front
    .match(/<file>\s*<path>([^<]+)<\/path>\s*<\/file>/)?.[1]
    ?.replaceAll('&amp;', '&');
  if (path === undefined || !URL.canParse(path)) return undefined;
  const url = new URL(path);
  const expected = new URL(template);
  if (
    url.origin !== expected.origin ||
    url.pathname !== expected.pathname ||
    url.searchParams.get('cgpass') !== 'foreground' ||
    url.searchParams.get('cgsync') !== item
  )
    return undefined;
  url.searchParams.set('cgsync', key);
  return url.href;
}

/** INFO confirms an HTML process, even while its initial raster is still empty.
 * Each staged look reports its own first painted state on the existing page-state
 * endpoint. A short-lived identifier belongs to one renderer on one engine. */
export class FocusArtworkPaints {
  #pending = new Map<string, FocusPaint>();

  expect(source: string, look: string, signal: AbortSignal, options?: { matte?: boolean }) {
    const url = new URL(source);
    const colorToken = url.searchParams.get('cgpaint');
    const color = colorToken && this.#pending.get(colorToken);
    const pair =
      options?.matte &&
      color &&
      !color.matte &&
      color.pair === undefined &&
      color.look === look &&
      color.path === url.pathname
        ? {}
        : undefined;
    if (pair && color) color.pair = pair;
    const token = randomUUID();
    url.searchParams.set('cgpaint', token);
    const ready = new Promise<boolean>((resolve) => {
      const finish = (painted: boolean) => {
        this.#pending.delete(token);
        signal.removeEventListener('abort', abort);
        resolve(painted);
      };
      const abort = () => finish(false);
      if (signal.aborted) return abort();
      this.#pending.set(token, {
        look,
        path: url.pathname,
        matte: options?.matte === true,
        ...(pair && { pair }),
        done: () => finish(true),
      });
      signal.addEventListener('abort', abort, { once: true });
    });
    return { url: url.href, ready };
  }

  // The two clocks belong to CEF pages on the same Caspar host. The Bridge
  // can live on another machine, so its own wall clock must not seed the start.
  rendezvous(token: string, look: unknown, clock: unknown): { startAt: number | null } | undefined {
    const entry = this.#pending.get(token);
    const pair = entry?.pair;
    if (
      !entry ||
      !pair ||
      entry.look !== look ||
      typeof clock !== 'number' ||
      !Number.isSafeInteger(clock) ||
      clock < 0 ||
      clock > Number.MAX_SAFE_INTEGER - 160
    )
      return undefined;
    if (pair.startAt === undefined) {
      if (entry.matte) pair.matteClock = clock;
      else pair.colorClock = clock;
      if (pair.colorClock !== undefined && pair.matteClock !== undefined)
        pair.startAt = Math.max(pair.colorClock, pair.matteClock) + 160;
    }
    return { startAt: pair.startAt ?? null };
  }

  report(token: string, field: string, index: number): boolean {
    const entry = this.#pending.get(token);
    if (
      entry === undefined ||
      field !== 'focus-artwork' ||
      index !== 0 ||
      (entry.pair !== undefined && entry.pair.startAt === undefined)
    )
      return false;
    entry.done();
    return true;
  }

  inject(html: string, request: string): string {
    const url = new URL(request, 'http://localhost');
    const token = url.searchParams.get('cgpaint') ?? '';
    const entry = this.#pending.get(token);
    if (entry === undefined || entry.path !== url.pathname) return html;
    // Text is an executable inline script in an otherwise unchanged exported
    // template. Escape the HTML delimiter even when a legacy look id contains it.
    const look = JSON.stringify(entry.look).replaceAll('<', '\\u003c');
    const script = `<script>(function(){
      var update = window.update, looking = false, reported = false;
      if (typeof update !== 'function') return;
      function painted(){
        if (reported || !looking) return;
        if (document.documentElement.getAttribute('data-cg-ready') !== '1' ||
            document.body.classList.contains('cg-pending')) {
          requestAnimationFrame(painted);
          return;
        }
        var images = Array.prototype.filter.call(document.images, function(img){
          return img.currentSrc && img.getClientRects().length && typeof img.decode === 'function';
        });
        Promise.all([document.fonts ? document.fonts.ready : null].concat(images.map(function(img){
          return img.decode().catch(function(){});
        }))).then(function(){
          requestAnimationFrame(function(){ requestAnimationFrame(function(){
            if (reported || !looking) return;
            reported = true;
            fetch('${TEMPLATE_PAGE_STATE_PATH}', {method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({take:'${token}',field:'focus-artwork',index:0})}).catch(function(){});
          }); });
        });
      }
      window.update = function(payload){
        var result = update.apply(this, arguments);
        try {
          var fields = typeof payload === 'string' ? JSON.parse(payload) : payload;
          if (fields && fields.__cg && fields.__cg.look === ${look} && !looking) {
            looking = true;
            requestAnimationFrame(painted);
          }
        } catch (_) {}
        return result;
      };
    })();</script>`;
    // STING reads luminance. Whiten the already composited foreground as a group:
    // nested opacity, antialiasing, imported images and shadows keep their alpha.
    // Black belongs outside the filtered group so a transparent pixel reads zero.
    const matteStyle = entry.matte
      ? '<style>:root{background:#000!important}:root>body{background:transparent!important;filter:brightness(0) invert(1)!important}</style>'
      : '';
    // CG ADD/UPDATE loads the two CEFs independently. A slow matte must not
    // begin an imported animation seconds after its visible color has started.
    // The paint hook above observes the real replay of the queued commands.
    const pairScript =
      entry.pair === undefined
        ? ''
        : `<script>(function () {
      var play = window.play, update = window.update, queued = [], loading = false;
      var expires = Date.now() + 20000;
      function coordinate() {
        if (Date.now() >= expires) return;
        fetch('${TEMPLATE_PAGE_STATE_PATH}', {method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({take:'${token}',field:'focus-pair-ready',index:0,look:${look},clock:Date.now()})})
          .then(function(response) {
            if (response.status === 404) return;
            if (!response.ok) throw new Error('focus start unavailable');
            return response.json().then(function(state) {
              if (Number.isSafeInteger(state.startAt)) run(state.startAt);
              else setTimeout(coordinate,40);
            });
          }).catch(function(){setTimeout(coordinate,80);});
      }
      function run(at) {
        function paint() {
          var elapsed = Date.now() - at;
          if (elapsed < 0) { requestAnimationFrame(paint); return; }
          window.play = play;
          window.update = update;
          for (var command of queued) command[0].apply(command[1], command[2]);
          queued = [];
          // Declarative CSS can already be running while its hidden page loads.
          // The two private surfaces share the same play epoch and keep authored delays.
          var timeline = document.timeline;
          if (timeline && timeline.currentTime != null && typeof CSSAnimation !== 'undefined') {
            for (var animation of document.getAnimations()) {
              if (animation instanceof CSSAnimation && animation.playState === 'running')
                animation.startTime = timeline.currentTime - elapsed;
            }
          }
        }
        requestAnimationFrame(paint);
      }
      window.play = function () { queued.push([play, this, arguments]); };
      window.update = function (payload) {
        queued.push([update, this, arguments]);
        var fields;
        try { fields = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch (_) {}
        if (loading || !fields || !fields.__cg || fields.__cg.look !== ${look}) return;
        loading = true;
        function loaded() {
          if (document.documentElement.getAttribute('data-cg-ready') !== '1') {
            requestAnimationFrame(loaded); return;
          }
          Promise.resolve(document.fonts && document.fonts.ready).then(function () {
            coordinate();
          });
        }
        loaded();
      };
    })();</script>`;
    return html.replace(/<\/body>/i, () => matteStyle + script + pairScript + '</body>');
  }
}
