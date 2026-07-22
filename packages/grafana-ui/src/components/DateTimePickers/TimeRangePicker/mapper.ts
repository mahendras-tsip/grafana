import { type TimeOption, type TimeRange, type TimeZone, rangeUtil, dateTimeFormat } from '@grafana/data';

import { getFeatureToggle } from '../../../utils/featureToggle';
import { commonFormat } from '../commonFormat';

function isElapsedTimeModeEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const params = new URLSearchParams(window.location.search);

  return params.get('elapsedTimeMode') === 'true' || params.get('var-elapsedTimeMode') === 'true';
}

function getElapsedZeroMsFromUrl(): number | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const params = new URLSearchParams(window.location.search);
  const rawZeroMs = params.get('elapsedZeroMs') ?? params.get('var-elapsedZeroMs');

  if (!rawZeroMs) {
    return undefined;
  }

  const zeroMs = Number(rawZeroMs);
  return Number.isFinite(zeroMs) ? zeroMs : undefined;
}

function getLocalDayStartMs(value: number): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getElapsedZeroMs(range: TimeRange): number {
  return getElapsedZeroMsFromUrl() ?? getLocalDayStartMs(range.from.valueOf());
}

function pad2(v: number): string {
  return String(v).padStart(2, '0');
}

function pad4(v: number): string {
  return String(v).padStart(4, '0');
}

function formatElapsedTimeRangeValue(value: number, zeroMs: number): string {
  const elapsedMs = Math.max(0, value - zeroMs);

  const totalHours = Math.floor(elapsedMs / (60 * 60 * 1000));
  const minutes = Math.floor((elapsedMs % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((elapsedMs % (60 * 1000)) / 1000);
  const fractionalSeconds = Math.floor(((elapsedMs % 1000) / 1000) * 10000);

  return `${String(totalHours).padStart(2, '0')}:${pad2(minutes)}:${pad2(seconds)}.${pad4(fractionalSeconds)}`;
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
  if (isElapsedTimeModeEnabled()) {
    const zeroMs = getElapsedZeroMs(range);

    const from = formatElapsedTimeRangeValue(range.from.valueOf(), zeroMs);
    const to = formatElapsedTimeRangeValue(range.to.valueOf(), zeroMs);

    return {
      from,
      to,
      display: `${from} to ${to}`,
    };
  }

  const from = dateTimeFormat(range.from, { timeZone, format: commonFormat });
  const to = dateTimeFormat(range.to, { timeZone, format: commonFormat });

  let display = `${from} to ${to}`;

  if (getFeatureToggle('localeFormatPreference')) {
    display = rangeUtil.describeTimeRange(range, timeZone);
  }

  return {
    from,
    to,
    display,
  };
};