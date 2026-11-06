import { describe, expect, it } from 'vitest';
import { findPeriod, normalizeKey, parseClock, parseDay, parseEntryType } from './timetable-import-rules.js';

describe('timetable import rules', () => {
  it('reads full and short day names', () => {
    expect(parseDay('Monday')).toBe('MONDAY');
    expect(parseDay('tues')).toBe('TUESDAY');
    expect(parseDay('Thu.')).toBe('THURSDAY');
    expect(parseDay('SAT')).toBe('SATURDAY');
    expect(parseDay('Mo')).toBeNull();
    expect(parseDay('Funday')).toBeNull();
  });

  it('reads clock times in common spellings', () => {
    expect(parseClock('8:00')).toBe('08:00');
    expect(parseClock('08:30')).toBe('08:30');
    expect(parseClock('8.45')).toBe('08:45');
    expect(parseClock('0900')).toBe('09:00');
    expect(parseClock('13:05:00')).toBe('13:05');
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('8:75')).toBeNull();
    expect(parseClock('Period 1')).toBeNull();
  });

  it('treats a blank type as a lesson and rejects unknown types', () => {
    expect(parseEntryType('')).toBe('LESSON');
    expect(parseEntryType(' break ')).toBe('BREAK');
    expect(parseEntryType('Activity')).toBe('ACTIVITY');
    expect(parseEntryType('Lunch')).toBeNull();
  });

  it('finds a period by name before start time', () => {
    const periods = [
      { name: 'Period 1', startTime: '08:00' },
      { name: 'Break', startTime: '09:30' },
    ];
    expect(findPeriod(periods, 'period 1')?.startTime).toBe('08:00');
    expect(findPeriod(periods, '09:30')?.name).toBe('Break');
    expect(findPeriod(periods, '9.30')?.name).toBe('Break');
    expect(findPeriod(periods, 'Period 9')).toBeNull();
    expect(findPeriod(periods, '')).toBeNull();
  });

  it('does not guess when two periods share a name', () => {
    const periods = [
      { name: 'Lesson', startTime: '08:00' },
      { name: 'Lesson', startTime: '09:00' },
    ];
    expect(findPeriod(periods, 'Lesson')).toBeNull();
    expect(findPeriod(periods, '09:00')?.startTime).toBe('09:00');
  });

  it('normalizes keys', () => {
    expect(normalizeKey('JHS 1-A')).toBe('jhs1a');
  });
});
