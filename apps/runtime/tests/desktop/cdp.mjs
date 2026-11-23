/* global fetch, WebSocket, AbortSignal, Buffer, setTimeout */
import fs from 'node:fs';
import { splashGone } from './app-window.mjs';

async function until(what, find, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const result = await find();
      if (result) return result;
    } catch {
      // The WebView process may still be opening the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  throw new Error(`timed out waiting for ${what}`);
}

/** A minimal DevTools client over Node's own WebSocket. */
export class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();
  static async attach(port, urlPrefix, timeoutMs) {
    const target = await until(
      `a page at ${urlPrefix} on DevTools port ${port}`,
      async () => {
        const list = await (
          await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1_000) })
        ).json();
        return list.find((t) => t.type === 'page' && t.url.startsWith(urlPrefix));
      },
      timeoutMs,
    );
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    return new Cdp(ws, target.url);
  }
  constructor(ws, url) {
    this.#ws = ws;
    this.url = url;
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.#pending.get(message.id);
      if (pending === undefined) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    };
  }
  send(method, params = {}) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.#pending.delete(id)) reject(new Error(`DevTools ${method} timed out`));
      }, 90_000);
    });
  }
  async evaluate(fn) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(${fn.toString()})()`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
  }
  /** `evaluate`, handing the page function ONE JSON-serialisable argument. */
  async evaluateWith(fn, arg) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(${fn.toString()})(${JSON.stringify(arg)})`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
  }
  /** A picture of the page — once the start-up splash has left ({@link splashGone}). */
  async screenshot(file) {
    await until('the start-up splash to leave', () => this.evaluate(splashGone), 25_000).catch(
      () => undefined,
    );
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }
  close() {
    this.#ws.close();
  }
}
