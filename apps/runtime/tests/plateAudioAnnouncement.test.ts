import { describe, expect, it } from 'vitest';
import { announcePlateAudio } from '../src/renderer/features/layers/plateAudio.js';

/**
 * 🔴 `CONSOLE-LOOK-06` DELTA 8 — the audio toast's SHAPE and its four rules.
 *
 * The reference's three examples are the pattern, and the pattern is not "what was pressed":
 * the layer's coordinate first, the RESULTING STATE second, and a consequence clause where the
 * operator cannot see the consequence. §4's rules are what the cases below hold.
 */
const coord = (id: string): string | null =>
  ({ 'guest-1': '1-10', 'guest-2': '1-11', 'guest-3': '1-12' })[id] ?? null;

describe('DELTA 8 — one short line per completed audio change', () => {
  it('states the RESULTING GAIN, with the coordinate first', () => {
    expect(announcePlateAudio({ 'guest-1': 1 }, { 'guest-1': 0 }, [], coord, 'Bed 1')).toBe(
      '1-10 · 100% requested gain.',
    );
  });

  it('states SILENT as a state, not as the verb that produced it', () => {
    expect(announcePlateAudio({ 'guest-1': 0 }, { 'guest-1': 1 }, [], coord, 'Bed 1')).toBe(
      '1-10 · 0% silent.',
    );
  });

  it('🔴 §4(c) — a NO-OP announces nothing: OFF on an already-silent plate', () => {
    expect(announcePlateAudio({ 'guest-1': 0 }, { 'guest-1': 0 }, [], coord, 'Bed 1')).toBeNull();
  });

  it('🔴 §4(e) — a REFUSED plate is not announced as done', () => {
    expect(
      announcePlateAudio({ 'guest-1': 1 }, { 'guest-1': 0 }, ['guest-1'], coord, 'Bed 1'),
    ).toBeNull();
  });

  it('🔴 SOLO says what the operator CANNOT see: the others zeroed, and no way back', () => {
    const said = announcePlateAudio(
      { 'guest-1': 1, 'guest-2': 0, 'guest-3': 0 },
      { 'guest-1': 1, 'guest-2': 1, 'guest-3': 1 },
      [],
      coord,
      'Bed 1',
    );
    expect(said).toBe('1-10 at 100%; other plates on Bed 1 set to zero. No automatic restore.');
    // The irreversibility is the clause that must never be dropped.
    expect(said).toContain('No automatic restore');
  });

  it('§4(b) — a BULK change is ONE line that states its scope, never one per plate', () => {
    expect(
      announcePlateAudio(
        { 'guest-1': 1, 'guest-2': 1 },
        { 'guest-1': 0, 'guest-2': 0 },
        [],
        coord,
        'Bed 1',
      ),
    ).toBe('2 plates set.');
  });

  it('a solo that changed nothing is still a no-op', () => {
    expect(
      announcePlateAudio(
        { 'guest-1': 1, 'guest-2': 0 },
        { 'guest-1': 1, 'guest-2': 0 },
        [],
        coord,
        'Bed 1',
      ),
    ).toBeNull();
  });

  it('never carries the prototype’s own “Demo only.” marker', () => {
    const said = announcePlateAudio({ 'guest-1': 1 }, { 'guest-1': 0 }, [], coord, 'Bed 1') ?? '';
    expect(said).not.toContain('Demo');
  });

  it('never puts a plate id in the sentence — the coordinate is the operator’s word', () => {
    const said = announcePlateAudio({ 'guest-1': 1 }, { 'guest-1': 0 }, [], coord, 'Bed 1') ?? '';
    expect(said).not.toContain('guest-1');
  });
});
