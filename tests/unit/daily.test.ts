import { describe, expect, it } from 'vitest';
import { dailyNumber, dailySeed, formatCountdown, msUntilNextDaily, shareText, withCommas } from '../../src/endless/Daily';

describe('daily seed and number', () => {
  it('uses the UTC date as YYYYMMDD', () => {
    expect(dailySeed(new Date('2026-10-21T00:00:00Z'))).toBe(20261021);
    expect(dailySeed(new Date('2026-10-21T23:59:59.999Z'))).toBe(20261021);
    expect(dailySeed(new Date('2026-10-22T00:00:00Z'))).toBe(20261022);
    expect(dailySeed(new Date('2027-01-05T12:00:00Z'))).toBe(20270105);
  });

  it('is the same worldwide regardless of local offset', () => {
    // 23:30 in New York on Oct 21 is already Oct 22 in UTC.
    expect(dailySeed(new Date('2026-10-21T23:30:00-04:00'))).toBe(20261022);
    // 01:00 in Tokyo on Oct 22 is still Oct 21 in UTC.
    expect(dailySeed(new Date('2026-10-22T01:00:00+09:00'))).toBe(20261021);
  });

  it('numbers days from Daily #1 on 2026-10-21', () => {
    expect(dailyNumber(new Date('2026-10-21T00:00:00Z'))).toBe(1);
    expect(dailyNumber(new Date('2026-10-21T23:59:59Z'))).toBe(1);
    expect(dailyNumber(new Date('2026-10-22T00:00:00Z'))).toBe(2);
    expect(dailyNumber(new Date('2026-12-01T10:00:00Z'))).toBe(42);
    expect(dailyNumber(new Date('2027-10-21T00:00:00Z'))).toBe(366);
    expect(dailyNumber(new Date('2026-10-22T01:00:00+09:00'))).toBe(1);
  });
});

describe('share text', () => {
  it('matches the plan format with the link on the next line', () => {
    expect(shareText({ number: 42, distance: 1284, snaps: 3, attempts: 3 })).toBe(
      'Doodle Bridge Daily #42 - 1,284 m - 3 snaps - best of 3\nhttps://doodle-bridge.joshmakesgames.app',
    );
  });

  it('handles singular snap, zero snaps and big numbers', () => {
    expect(shareText({ number: 1, distance: 80, snaps: 1, attempts: 1 }).split('\n')[0]).toBe('Doodle Bridge Daily #1 - 80 m - 1 snap - best of 1');
    expect(shareText({ number: 2, distance: 1234567.4, snaps: 0, attempts: 2 }).split('\n')[0]).toBe(
      'Doodle Bridge Daily #2 - 1,234,567 m - 0 snaps - best of 2',
    );
    expect(withCommas(999)).toBe('999');
    expect(withCommas(1000)).toBe('1,000');
  });

  it('never prints best of 0', () => {
    expect(shareText({ number: 3, distance: 5, snaps: 2, attempts: 0 })).toContain('best of 1');
  });
});

describe('next daily countdown', () => {
  it('counts to UTC midnight', () => {
    expect(msUntilNextDaily(new Date('2026-10-21T00:00:00Z'))).toBe(86_400_000);
    expect(msUntilNextDaily(new Date('2026-10-21T18:48:00Z'))).toBe(5 * 3_600_000 + 12 * 60_000);
    expect(msUntilNextDaily(new Date('2026-12-31T23:59:59Z'))).toBe(1000);
  });

  it('formats the countdown', () => {
    expect(formatCountdown(5 * 3_600_000 + 12 * 60_000)).toBe('5h 12m');
    expect(formatCountdown(9 * 60_000 + 5000)).toBe('9m 05s');
    expect(formatCountdown(-5)).toBe('0m 00s');
  });
});
