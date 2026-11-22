import { decodeCgData, defaultHandlers, type MockHandle } from '@cg/amcp-mock';
import { readCgControl, TEMPLATE_PAGE_STATE_PATH } from '@cg/shared-schema';

/** The AMCP mock loads HTML but has no CEF to report that a private Focus page painted.
 * Echo the current page token and look, plus the composite identities actually staged on this mock.
 */
export function mockFocusArtwork(engine: MockHandle, failPaint = false) {
  const painted: { lookId: string; layer: number }[] = [];
  const received = new Set<string>();
  const prepared = new Map<string, { token: string; layer: number }>();
  const cg = defaultHandlers().get('CG')!;
  engine.setHandler('CG', async (request, context, socket) => {
    const answer = await cg(request, context, socket);
    const slot = /^(\d+)-(\d+)$/.exec(request.args[0] ?? '');
    if (request.args[1] !== 'UPDATE' || slot === null || answer.kind !== 'ok') return answer;
    const channel = Number(slot[1]);
    const layer = Number(slot[2]);
    const filePath = engine.layerState({ channel, layer })?.filePath;
    const url = filePath?.startsWith('http:') ? new URL(filePath) : undefined;
    const token = url?.searchParams.get('cgpaint');
    if (url === undefined || !token || received.has(token)) return answer;
    if (failPaint) return { kind: 'err', code: 501, verb: 'CG' };

    const data = decodeCgData(request.args[3] ?? '').data;
    const lookId = data === null ? undefined : readCgControl(JSON.parse(data))?.look;
    if (lookId === undefined) return answer;
    const writeState = (take: string, field: string, extra: object = {}) =>
      fetch(new URL(TEMPLATE_PAGE_STATE_PATH, url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ take, field, index: 0, ...extra }),
      });

    const report = async (take: string, plane: number) => {
      if ((await writeState(take, 'focus-artwork')).status !== 204)
        throw new Error('Bridge refused the staged Focus page paint');
      received.add(take);
      painted.push({ lookId, layer: plane });
    };
    // The unpaired path has no color/matte rendezvous. A paired page starts only after both
    // updates, and the Bridge verifies that the two proofs share the same rendering epoch.
    const pair = await writeState(token, 'focus-pair-ready', { look: lookId, clock: Date.now() });
    if (pair.status === 200) {
      const key = JSON.stringify([url.searchParams.get('cgsync'), lookId]);
      const other = prepared.get(key);
      const result = (await pair.json()) as { startAt: number | null };
      if (other === undefined) {
        if (result.startAt !== null) throw new Error('Focus pair started without the other page');
        prepared.set(key, { token, layer });
        return answer;
      }
      if (result.startAt === null) throw new Error('Focus pair did not choose a start time');
      prepared.delete(key);
      const prior = await writeState(other.token, 'focus-pair-ready', {
        look: lookId,
        clock: Date.now(),
      });
      const priorResult = (await prior.json()) as { startAt: number | null };
      if (!prior.ok || priorResult.startAt !== result.startAt)
        throw new Error('Focus pair did not share a start time');
      await report(other.token, other.layer);
    } else if (pair.status !== 404) {
      throw new Error(`Unexpected Focus paint response ${String(pair.status)}`);
    }
    await report(token, layer);
    return answer;
  });

  const composites = new Map<number, { path: string; kind: 'sting' | 'mix'; fields: number }>();
  const play = defaultHandlers().get('PLAY')!;
  engine.setHandler('PLAY', async (request, context, socket) => {
    const [channel, layer] = (request.args[0] ?? '').split('-').map(Number);
    if (channel !== undefined && layer !== undefined) {
      const current = engine.layerState({ channel, layer });
      const [, path, operation, fields] = request.args;
      composites.delete(layer);
      if (
        operation === 'STING' &&
        current?.producer === 'route' &&
        path?.includes('cgfocus=') &&
        /^route:\/\/\d+-\d+$/.test(fields ?? '') &&
        request.args[4] === '0' &&
        /^route:\/\/\d+-\d+$/.test(request.args[5] ?? '')
      ) {
        composites.set(layer, { path, kind: 'sting', fields: 600 });
      } else if (operation === 'MIX' && fields === '30000' && path && current?.filePath === path) {
        composites.set(layer, { path, kind: 'mix', fields: 30000 });
      }
    }
    return play(request, context, socket);
  });

  const info = defaultHandlers().get('INFO')!;
  engine.setHandler('INFO', async (request, context, socket) => {
    const answer = await info(request, context, socket);
    if (answer.kind !== 'ok-line') return answer;
    const data = answer.data.replace(
      /<layer_(\d+)>([\s\S]*?)<\/layer_\1>/g,
      (entry: string, id: string) => {
        const compound = composites.get(Number(id));
        if (!compound || !entry.includes(compound.path.replaceAll('&', '&amp;'))) return entry;
        return entry.replace(
          /<foreground>([\s\S]*?)<\/foreground>/,
          (_front: string, body: string) =>
            '<foreground>' +
            body.replace(
              /<producer>[^<]+<\/producer>/,
              '<producer>transition</producer><transition><frame>2</frame><frame>' +
                compound.fields +
                '</frame><type>' +
                compound.kind +
                '</type></transition>',
            ) +
            '</foreground>',
        );
      },
    );
    return {
      ...answer,
      data: data.replace(
        /<file>\s*<path>route:\/\/(\d+)-(\d+)<\/path>\s*<\/file>/g,
        '<route><channel>$1</channel><layer>$2</layer></route>',
      ),
    };
  });

  return painted;
}
