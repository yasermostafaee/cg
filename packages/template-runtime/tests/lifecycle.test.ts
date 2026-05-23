import { describe, expect, it } from 'vitest';
import { LifecycleStateMachine, canTransition } from '../src/lifecycle.js';

describe('canTransition', () => {
  it('allows pending → playing', () => {
    expect(canTransition('pending', 'playing')).toBe(true);
  });
  it('allows playing → on-air', () => {
    expect(canTransition('playing', 'on-air')).toBe(true);
  });
  it('allows on-air → exiting', () => {
    expect(canTransition('on-air', 'exiting')).toBe(true);
  });
  it('allows exiting → stopped', () => {
    expect(canTransition('exiting', 'stopped')).toBe(true);
  });
  it('allows stopped → playing (replay)', () => {
    expect(canTransition('stopped', 'playing')).toBe(true);
  });
  it('forbids pending → on-air directly', () => {
    expect(canTransition('pending', 'on-air')).toBe(false);
  });
  it('forbids removed → anything', () => {
    expect(canTransition('removed', 'playing')).toBe(false);
    expect(canTransition('removed', 'pending')).toBe(false);
  });
});

describe('LifecycleStateMachine', () => {
  it('starts in pending', () => {
    expect(new LifecycleStateMachine().state).toBe('pending');
  });
  it('transitions on a legal move', () => {
    const m = new LifecycleStateMachine();
    expect(m.transition('playing')).toBe(true);
    expect(m.state).toBe('playing');
  });
  it('rejects an illegal move', () => {
    const m = new LifecycleStateMachine();
    expect(m.transition('on-air')).toBe(false);
    expect(m.state).toBe('pending');
  });
  it('forceTransition ignores legality (for remove)', () => {
    const m = new LifecycleStateMachine();
    m.forceTransition('removed');
    expect(m.state).toBe('removed');
  });
});
