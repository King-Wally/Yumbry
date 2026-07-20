import { describe, expect, it } from 'vitest';
import { isoDurationToMinutes, minutesToIsoDuration } from '../src/utils/iso-duration.js';

describe('isoDurationToMinutes', () => {
  it('parses minutes only', () => {
    expect(isoDurationToMinutes('PT30M')).toBe(30);
  });

  it('parses hours and minutes', () => {
    expect(isoDurationToMinutes('PT1H30M')).toBe(90);
  });

  it('parses hours only', () => {
    expect(isoDurationToMinutes('PT2H')).toBe(120);
  });

  it('parses days, hours, and minutes', () => {
    expect(isoDurationToMinutes('P1DT2H15M')).toBe(24 * 60 + 2 * 60 + 15);
  });

  it('parses seconds, rounding to the nearest minute', () => {
    expect(isoDurationToMinutes('PT90S')).toBe(2);
  });

  it('returns null for non-string input', () => {
    expect(isoDurationToMinutes(undefined)).toBeNull();
    expect(isoDurationToMinutes(null)).toBeNull();
  });

  it('returns null for malformed durations', () => {
    expect(isoDurationToMinutes('not-a-duration')).toBeNull();
    expect(isoDurationToMinutes('P')).toBeNull();
  });
});

describe('minutesToIsoDuration', () => {
  it('formats minutes only', () => {
    expect(minutesToIsoDuration(30)).toBe('PT30M');
  });

  it('formats hours and minutes', () => {
    expect(minutesToIsoDuration(90)).toBe('PT1H30M');
  });

  it('formats whole hours', () => {
    expect(minutesToIsoDuration(120)).toBe('PT2H');
  });

  it('returns undefined for null, undefined, or non-positive input', () => {
    expect(minutesToIsoDuration(null)).toBeUndefined();
    expect(minutesToIsoDuration(undefined)).toBeUndefined();
    expect(minutesToIsoDuration(0)).toBeUndefined();
    expect(minutesToIsoDuration(-5)).toBeUndefined();
  });

  it('round-trips with isoDurationToMinutes', () => {
    for (const minutes of [1, 15, 30, 45, 60, 90, 120, 150]) {
      expect(isoDurationToMinutes(minutesToIsoDuration(minutes))).toBe(minutes);
    }
  });
});
