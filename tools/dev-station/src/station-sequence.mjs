/**
 * 🔴 `DEV-STATION-01` — **THE LAUNCHER'S SEQUENCE**, with every side effect injected so the tests
 * drive the same code the command runs (`dev-station-cli.mjs` wires the real ones):
 *
 *   1. the installed CG Control in the way? ASK — and stop it only on a yes. Never without asking;
 *      any other program on the station's ports is NAMED and left alone;
 *   2. BUILD — before anything starts, so no stale compiled code ever runs;
 *   3. the Playout — `--fake`'s own (a whole fake station, started fresh), `--playout <url>`, the
 *      remembered one, or asked for ONCE;
 *   4. START the bridge and the console, then the banner, then the browser.
 */
import { ASK, CONSOLE_URL, DECLINED, answerIsYes, banner, blockedLine } from './station-plan.mjs';

const ASK_ADDRESS = 'Playout address (for example 192.168.21.111): ';

/**
 * @param {{ fake: boolean, playout: string | undefined, open: boolean, stateDir: string, log?: string }} options
 * @param {object} deps — see `types/station-sequence.d.ts`
 */
export async function runDevStation(options, deps) {
  // 1 — who stands in the way.
  let seen = await deps.probe();
  if (seen.installed.length > 0) {
    if (!answerIsYes(await deps.ask(ASK))) {
      deps.print(DECLINED);
      return { outcome: 'declined' };
    }
    await deps.stop(seen.installed.map((p) => p.pid));
    seen = await deps.probe();
    if (seen.installed.length > 0) {
      deps.print('CG Control did not close — close it by hand, then run pnpm dev:station again.');
      return { outcome: 'declined' };
    }
  }
  if (seen.blocked.length > 0) {
    for (const b of seen.blocked) deps.print(blockedLine(b));
    return { outcome: 'blocked' };
  }

  // 2 — build first.
  if ((await deps.build()) !== 0) {
    deps.print('The build failed — nothing was started, so nothing stale runs.');
    return { outcome: 'build-failed' };
  }

  // 3 — the Playout.
  let playout;
  let fake;
  if (options.fake) {
    /*
      `DELTA-MULTI-CHANNEL-01-A` A1 — A FRESH FAKE STATION EVERY RUN. The fake Playout is new at
      every start — new keys, new issuer, new port — so a remembered fake station holds a session,
      an issuer and a CasparCG connection that nothing of this run answers: the owner's still named
      CasparCG on the bridge's own port 5280, and no first-run would ever run again to correct it.
      The last one is kept beside it (`.previous`), so a check can still be read after the next start.
      After the build, so a failed build leaves the last station as it was.
    */
    await deps.freshFakeState();
    fake = await deps.startFake();
    playout = fake.address;
    // Its port is new every start, so its issuer is too: the one writer clears the old one.
    try {
      await deps.setPlayoutAddress(playout);
    } catch (err) {
      deps.print(err instanceof Error ? err.message : String(err));
      await fake.stop();
      return { outcome: 'no-address' };
    }
  } else {
    if (options.playout !== undefined) {
      try {
        await deps.setPlayoutAddress(options.playout);
      } catch (err) {
        deps.print(err instanceof Error ? err.message : String(err));
        return { outcome: 'no-address' };
      }
    }
    playout = deps.readPlayoutAddress();
    while (playout === null) {
      const typed = await deps.ask(ASK_ADDRESS);
      if (typed === null || typed.trim() === '') {
        deps.print('No Playout address — run pnpm dev:station --playout <address>, or --fake.');
        return { outcome: 'no-address' };
      }
      try {
        await deps.setPlayoutAddress(typed.trim());
      } catch (err) {
        deps.print(err instanceof Error ? err.message : String(err));
        continue;
      }
      playout = deps.readPlayoutAddress();
    }
  }

  // 4 — start, then say where it is.
  let running;
  try {
    running = await deps.start(playout);
  } catch (err) {
    deps.print(err instanceof Error ? err.message : String(err));
    await fake?.stop();
    return { outcome: 'failed' };
  }
  for (const line of banner({ stateDir: options.stateDir, playout, fake, log: options.log })) {
    deps.print(line);
  }
  if (options.open) deps.open(CONSOLE_URL);
  return { outcome: 'running', running, fake };
}
