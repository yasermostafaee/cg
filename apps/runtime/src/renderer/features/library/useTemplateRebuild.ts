import { useEffect } from 'react';
import { useBridgeReadable } from '../../hooks/useBridgeSnapshot.js';
import { useAuthSession } from '../../hooks/useAuthSession.js';
import { useHoldsOperatorRole } from '../../hooks/useCanOperate.js';
import { useLink } from '../../hooks/useLink.js';
import { APP_VERSION } from '../../appVersion.js';
import { reportCommandError, reportCommandSuccess } from '../status/commandFeedback.js';
import { pageBuildOf } from './templateDelivery.js';
import { rebuildFailedLine, rebuiltLine, runRebuildPass } from './templateRebuild.js';
// The same bundled faces every import bakes in — part of what a page is built from.
import appFontsCss from '../../fonts.css?inline';

/**
 * 🔴 `PAGE-REBUILD-01` (`C-034`) — **ON CONNECT, BUILD AGAIN EVERY PAGE AN EARLIER RUNTIME BUILT.**
 *
 * Mounted once, in `App` (the one component alive for the page's whole life). Each time the link
 * becomes usable, by a console that may operate, it runs ONE pass: ask CG Bridge what this runtime
 * should rebuild, rebuild it, and say once — in one sentence, on the refusal surface that stays
 * until it is dismissed — which templates could not be rebuilt. A pass that rebuilds everything says
 * nothing: the Log has a row per rebuilt template.
 *
 * ⚠ Only a console that may OPERATE runs it: a rebuild is an `operator` request, and a read-only
 * sign-in would only be refused. `unknown` (no answer yet) waits for the answer rather than guess.
 * A pass in flight is never started twice; a reconnect mid-pass simply asks again next time.
 */
let passInFlight = false;

export function useTemplateRebuild(): void {
  const readable = useBridgeReadable();
  const link = useLink();
  const auth = useAuthSession();
  const operates = useHoldsOperatorRole();
  const live = readable && link === 'live' && auth.kind !== 'unknown' && operates;
  useEffect(() => {
    if (!live || passInFlight) return;
    passInFlight = true;
    void runRebuildPass(window.cg, {
      build: pageBuildOf(APP_VERSION, appFontsCss),
      fontsCss: appFontsCss,
    })
      .then((result) => {
        // A confirmation (it hides itself) for what was rebuilt or held back…
        const done = rebuiltLine(result);
        if (done !== null) reportCommandSuccess(done);
        // …and a refusal (it stays until dismissed) for what could not be rebuilt.
        const failed = rebuildFailedLine(result.failed);
        if (failed !== null) reportCommandError(failed);
      })
      .catch(() => undefined)
      .finally(() => {
        passInFlight = false;
      });
  }, [live]);
}
