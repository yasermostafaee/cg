import { TEMPLATE_PAGE_STATE_PATH } from '@cg/shared-schema';

/** Keep the resident background transparent wherever an active native effect
 * owns the fallback. This includes previously exported pages whose animation
 * watchdog restores the original fallback after two seconds. */
export class NativeFallbackHolds {
  readonly #active = new Set<string>();

  begin(effect: string) {
    this.#active.add(effect);
  }

  end(effect: string) {
    this.#active.delete(effect);
  }

  accepts(effect: string, field: string, index: number) {
    return field === 'native-fallback-hold' && index === 0 && this.#active.has(effect);
  }

  inject(html: string, request: string): string {
    const pass = new URL(request, 'http://localhost').searchParams.get('cgpass');
    if (pass !== 'background') return html;
    const script = `<script>(function () {
      var update = window.update;
      if (typeof update !== 'function') return;
      var current = null;
      function release(owner) {
        if (!current || current !== owner) return;
        current = null;
        clearTimeout(owner.timer);
        owner.style.remove();
      }
      // If Bridge or the channel disappears mid-transition, return control
      // to the author's fallback. A delayed answer never releases a newer take.
      function watch(owner) {
        owner.timer = setTimeout(function () {
          if (current !== owner) return;
          var controller = new AbortController();
          var timeout = setTimeout(function () { controller.abort(); }, 2000);
          fetch('${TEMPLATE_PAGE_STATE_PATH}', { method: 'POST', signal: controller.signal,
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({take:owner.id, field:'native-fallback-hold', index:0})
          }).then(function (response) {
            if (current !== owner) return;
            if (response.ok) watch(owner); else release(owner);
          }, function () { release(owner); }).finally(function () { clearTimeout(timeout); });
        }, 1200);
      }
      window.update = function (payload) {
        var c;
        try { c = (typeof payload === 'string' ? JSON.parse(payload) : payload).__cg; } catch (_) {}
        if (c && c.nativeFallbackHold === true && typeof c.presetEffectId === 'string' && c.presetEffectId && c.frameTransition) {
          var ids = c.frameTransition.hideFallbackPlateIds;
          if (Array.isArray(ids) && ids.length && ids.length <= 128 && ids.every(function (id) { return typeof id === 'string' && id.length; })) {
            release(current);
            var style = document.createElement('style');
            style.textContent = ids.map(function (id) {
              return '[data-cg-live-source=' + CSS.escape(id) + '] > [data-cg-live-fallback]';
            }).join(',') + '{visibility:hidden!important}';
            document.head.appendChild(style);
            current = { id:c.presetEffectId, style:style };
            watch(current);
          }
        }
        var result = update.apply(this, arguments);
        if (c && current && (c.take || c.restorePresetEffectId === current.id ||
          (c.frameTransition === null && c.presetTransitionCommit &&
            c.presetEffectId === current.id))) {
          var owner = current;
          Promise.resolve(result).then(function () {
            requestAnimationFrame(function () { release(owner); });
          }, function () { release(owner); });
        }
        return result;
      };
    })();</script>`;
    return html.replace(/<\/body>/i, () => script + '</body>');
  }
}
