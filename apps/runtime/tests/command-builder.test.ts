import { describe, expect, it } from 'vitest';
import { buildClear, buildPlay, buildStop, buildUpdate } from '../src/main/core/command-builder.js';

describe('command-builder', () => {
  const slot = { channel: 1, layer: 10 };

  it('buildPlay quotes the URL and emits PLAY ... HTML', () => {
    const cmd = buildPlay(slot, 'file:///C:/templates/index.html');
    expect(cmd.line).toBe('PLAY 1-10 "file:///C:/templates/index.html" HTML');
    expect(cmd.priority).toBe('normal');
    expect(cmd.timeoutMs).toBe(5000);
    expect(cmd.retries).toBe(1);
  });

  it('buildPlay survives Persian content in the URL via the quote() escape pass', () => {
    const cmd = buildPlay(slot, 'file:///C:/templates/فارسی/index.html');
    expect(cmd.line).toContain('فارسی');
  });

  it('buildUpdate wraps the JSON in CG INVOKE update', () => {
    const cmd = buildUpdate(slot, '{"title":"hi"}');
    expect(cmd.line).toBe('CG 1-10 INVOKE 1 "update" "{\\"title\\":\\"hi\\"}"');
    expect(cmd.priority).toBe('normal');
    expect(cmd.timeoutMs).toBe(2000);
  });

  it('buildUpdate preserves a Persian payload through the quote pass', () => {
    const cmd = buildUpdate(slot, '{"title":"خبر فوری"}');
    expect(cmd.line).toContain('خبر فوری');
  });

  it('buildStop emits CG STOP at urgent priority with 3 retries (air-safety)', () => {
    const cmd = buildStop(slot);
    expect(cmd.line).toBe('CG 1-10 STOP 1');
    expect(cmd.priority).toBe('urgent');
    expect(cmd.retries).toBe(3);
  });

  it('buildClear emits CLEAR <ch>-<layer> at urgent priority', () => {
    const cmd = buildClear(slot);
    expect(cmd.line).toBe('CLEAR 1-10');
    expect(cmd.priority).toBe('urgent');
    expect(cmd.retries).toBe(3);
  });
});
