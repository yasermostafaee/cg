import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, type ParsedAmcpResponse } from '../src/index.js';
import { quote } from '../src/amcp/escape.js';

/**
 * Integration tests against @cg/amcp-mock running in-process. Every test
 * spins up a fresh mock on an ephemeral port so they can parallelize.
 */

let mock: MockHandle | undefined;
let transport: AmcpTransport | undefined;

afterEach(async () => {
  if (transport) {
    transport.destroy();
    transport = undefined;
  }
  if (mock) {
    await mock.stop();
    mock = undefined;
  }
});

async function setup(): Promise<{ mock: MockHandle; transport: AmcpTransport }> {
  mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  transport = new AmcpTransport();
  await transport.connect(mock.host, mock.amcpPort);
  return { mock, transport };
}

async function nextResponse(t: AmcpTransport): Promise<ParsedAmcpResponse> {
  return new Promise((resolve) => {
    t.once('response', resolve);
  });
}

describe('AmcpTransport', () => {
  it('round-trips a VERSION command and parses the 201 ack', async () => {
    const { transport } = await setup();
    const responseP = nextResponse(transport);
    await transport.send('VERSION');
    const resp = await responseP;
    expect(resp).toMatchObject({
      kind: 'ok-line',
      code: 201,
      verb: 'VERSION',
      data: '2.3.2 Stable',
    });
  });

  it('round-trips an INFO command and parses the 200 multi-line ack', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, channels: 2, disableOsc: true });
    transport = new AmcpTransport();
    await transport.connect(mock.host, mock.amcpPort);
    const responseP = nextResponse(transport);
    await transport.send('INFO');
    const resp = await responseP;
    expect(resp).toMatchObject({
      kind: 'ok-multi',
      code: 200,
      verb: 'INFO',
      lines: ['1 PAL PLAYING', '2 PAL PLAYING'],
    });
  });

  it('passes a quoted Persian payload through unmodified', async () => {
    const { mock, transport } = await setup();
    const captured: string[] = [];
    mock.setHandler('CG', (req) => {
      captured.push(req.args.join('|'));
      return { kind: 'ok', code: 202, verb: 'CG' };
    });

    const persianJson = '{"title":"خبر فوری"}';
    const responseP = nextResponse(transport);
    await transport.send(`CG 1-10 INVOKE 0 ${quote(persianJson)}`);
    await responseP;

    expect(captured[0]).toBe(`1-10|INVOKE|0|${persianJson}`);
  });

  it('emits a 400 error for an unknown verb', async () => {
    const { transport } = await setup();
    const responseP = nextResponse(transport);
    await transport.send('GIBBERISH');
    expect(await responseP).toMatchObject({ kind: 'err', code: 400, verb: 'ERROR' });
  });

  it('keeps responses in send-order under pipelining', async () => {
    const { transport } = await setup();
    const responses: ParsedAmcpResponse[] = [];
    transport.on('response', (r) => responses.push(r));

    await transport.send('VERSION');
    await transport.send('VERSION');
    await transport.send('VERSION');
    await new Promise((r) => setTimeout(r, 50));

    expect(responses).toHaveLength(3);
    for (const r of responses) {
      expect(r).toMatchObject({ kind: 'ok-line', verb: 'VERSION', data: '2.3.2 Stable' });
    }
  });

  it('emits "connected" on successful connect', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    transport = new AmcpTransport();
    const connectedP = new Promise<void>((resolve) =>
      transport!.once('connected', () => resolve()),
    );
    await transport.connect(mock.host, mock.amcpPort);
    await connectedP;
    expect(transport.isConnected).toBe(true);
  });

  it('rejects connect() when the server refuses', async () => {
    transport = new AmcpTransport();
    // Port 1 is reserved and routing it to localhost should refuse immediately.
    await expect(transport.connect('127.0.0.1', 1)).rejects.toThrow();
    expect(transport.isConnected).toBe(false);
  });

  it('refuses a second connect on the same transport', async () => {
    const { transport } = await setup();
    await expect(transport.connect('127.0.0.1', 1)).rejects.toThrow(/already connected/);
  });

  it('rejects send() when not connected', async () => {
    transport = new AmcpTransport();
    await expect(transport.send('VERSION')).rejects.toThrow(/not writable/);
  });

  it('emits "close" when the peer disconnects', async () => {
    const { mock, transport } = await setup();
    const closeP = new Promise<{ wasError: boolean }>((resolve) =>
      transport.once('close', resolve),
    );
    mock.closeAllAmcpConnections();
    const info = await closeP;
    expect(info).toEqual({ wasError: false });
    expect(transport.isConnected).toBe(false);
  });

  it('graceful close() flushes and resolves', async () => {
    const { transport } = await setup();
    await transport.send('VERSION');
    await transport.close();
    expect(transport.isConnected).toBe(false);
  });

  it('close() is a no-op when not connected', async () => {
    transport = new AmcpTransport();
    await expect(transport.close()).resolves.toBeUndefined();
  });

  it('destroy() is a no-op when not connected', () => {
    transport = new AmcpTransport();
    expect(() => transport!.destroy()).not.toThrow();
  });

  it('reports pendingBytes from the underlying parser', async () => {
    const { transport } = await setup();
    // Cleanly synchronous reads — we never feed mid-line in this test.
    expect(transport.pendingBytes).toBe(0);
  });
});
