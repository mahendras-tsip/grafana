import { type TimeOption, type TimeRange, type TimeZone, rangeUtil } from '@grafana/data';

import { commonFormat } from '../commonFormat';

function getLocalDayStartMs(value: number): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function pad2(v: number): string {
  return String(v).padStart(2, '0');
}

function formatElapsedTimeRangeValue(value: number, zeroMs: number): string {
  const elapsedMs = value - zeroMs;

  if (elapsedMs < 0) {
    return '00:00:00';
  }

  const totalHours = Math.floor(elapsedMs / (60 * 60 * 1000));
  const minutes = Math.floor((elapsedMs % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((elapsedMs % (60 * 1000)) / 1000);

  return `${pad2(totalHours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

/**
 * Takes a printable TimeOption and builds a TimeRange with DateTime properties from it
 */
export const mapOptionToTimeRange = (option: TimeOption, timeZone?: TimeZone): TimeRange => {
  return rangeUtil.convertRawToRange({ from: option.from, to: option.to }, timeZone, undefined, commonFormat);
};

/**
 * Takes a TimeRange and makes a printable TimeOption with formatted date strings correct for the timezone from it
 */
export const mapRangeToTimeOption = (range: TimeRange, timeZone?: TimeZone): TimeOption => {
  const fromMs = range.from.valueOf();
  const toMs = range.to.valueOf();

  const zeroMs = getLocalDayStartMs(fromMs);

  const displayFrom = formatElapsedTimeRangeValue(fromMs, zeroMs);
  const displayTo = formatElapsedTimeRangeValue(toMs, zeroMs);

  return {
    // Keep Grafana internal state / URL safe.
    from: String(fromMs),
    to: String(toMs),

    // Only the visible picker text becomes elapsed.
    display: `${displayFrom} to ${displayTo}`,
  };
};