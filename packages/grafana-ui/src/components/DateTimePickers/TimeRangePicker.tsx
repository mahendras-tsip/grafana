import { css, cx } from '@emotion/css';
import { useDialog } from '@react-aria/dialog';
import { FocusScope } from '@react-aria/focus';
import { useOverlay } from '@react-aria/overlays';
import { memo, createRef, useState, useEffect, type JSX } from 'react';

import {
  rangeUtil,
  type GrafanaTheme2,
  dateTime,
  dateTimeFormat,
  timeZoneFormatUserFriendly,
  type TimeOption,
  type TimeRange,
  type TimeZone,
  getTimeZoneInfo,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t, Trans } from '@grafana/i18n';

import { useStyles2 } from '../../themes/ThemeContext';
import { getFeatureToggle } from '../../utils/featureToggle';
import { ButtonGroup } from '../Button/ButtonGroup';
import { getModalStyles } from '../Modal/getModalStyles';
import { getPortalContainer } from '../Portal/Portal';
import { ToolbarButton } from '../ToolbarButton/ToolbarButton';
import { Tooltip } from '../Tooltip/Tooltip';

import { TimePickerContent } from './TimeRangePicker/TimePickerContent';
import { mapRangeToTimeOption } from './TimeRangePicker/mapper';
import { TimeZoneDescription } from './TimeZonePicker/TimeZoneDescription';
import { type WeekStart } from './WeekStartPicker';
import { getQuickOptions } from './options';
import { useTimeSync } from './utils/useTimeSync';

/** @public */
export interface TimeRangePickerProps {
  hideText?: boolean;
  value: TimeRange;
  timeZone?: TimeZone;
  fiscalYearStartMonth?: number;

  /**
   * If you handle sync state between pickers yourself use this prop to pass the sync button component.
   * Otherwise, a default one will show automatically if sync is possible.
   */
  timeSyncButton?: JSX.Element;

  // Use to manually set the synced styles for the time range picker if you need to control the sync state yourself.
  isSynced?: boolean;

  // Use to manually set the initial sync state for the time range picker. It will use the current value to sync.
  initialIsSynced?: boolean;

  onChange: (timeRange: TimeRange) => void;
  onChangeTimeZone: (timeZone: TimeZone) => void;
  onChangeFiscalYearStartMonth?: (month: number) => void;
  onMoveBackward: () => void;
  onMoveForward: () => void;
  moveForwardTooltip?: string;
  moveBackwardTooltip?: string;
  onZoom: () => void;
  onError?: (error?: string) => void;
  history?: TimeRange[];
  quickRanges?: TimeOption[];
  hideQuickRanges?: boolean;
  widthOverride?: number;
  isOnCanvas?: boolean;
  onToolbarTimePickerClick?: () => void;
  /** Which day of the week the calendar should start on. Possible values: "saturday", "sunday" or "monday" */
  weekStart?: WeekStart;
}

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

function getElapsedTimePickerZeroMs(value: TimeRange): number {
  return getElapsedZeroMsFromUrl() ?? getLocalDayStartMs(value.from.valueOf());
}

function pad2(v: number): string {
  return String(v).padStart(2, '0');
}

function pad4(v: number): string {
  return String(v).padStart(4, '0');
}

// function formatElapsedTimeRangeValue(value: number, zeroMs: number): string {
//   const elapsedMs = Math.max(0, value - zeroMs);

//   const totalHours = Math.floor(elapsedMs / (60 * 60 * 1000));
//   const minutes = Math.floor((elapsedMs % (60 * 60 * 1000)) / (60 * 1000));
//   const seconds = Math.floor((elapsedMs % (60 * 1000)) / 1000);
//   const fractionalSeconds = Math.floor(((elapsedMs % 1000) / 1000) * 10000);

//   return `${String(totalHours).padStart(2, '0')}:${pad2(minutes)}:${pad2(seconds)}.${pad4(fractionalSeconds)}`;
// }

function formatElapsedTimeRangeValue(value: number, zeroMs: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(zeroMs)) {
    return 'Invalid date';
  }

  const elapsedMs = Math.max(0, value - zeroMs);

  const totalHours = Math.floor(elapsedMs / (60 * 60 * 1000));
  const minutes = Math.floor((elapsedMs % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((elapsedMs % (60 * 1000)) / 1000);
  const fractionalSeconds = Math.floor(((elapsedMs % 1000) / 1000) * 10000);

  return `${String(totalHours).padStart(2, '0')}:${pad2(minutes)}:${pad2(seconds)}.${pad4(fractionalSeconds)}`;
}

function getNumberParamFromUrl(name: string): number | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const rawValue = new URLSearchParams(window.location.search).get(name);

  if (!rawValue) {
    return undefined;
  }

  const value = Number(rawValue);

  return Number.isFinite(value) ? value : undefined;
}

function formatElapsedTimeRange(value: TimeRange): string {
  const zeroMs = getElapsedTimePickerZeroMs(value);

  let fromMs = value.from.valueOf();
  let toMs = value.to.valueOf();

  if (!Number.isFinite(fromMs)) {
    fromMs = getNumberParamFromUrl('from') ?? NaN;
  }

  if (!Number.isFinite(toMs)) {
    toMs = getNumberParamFromUrl('to') ?? NaN;
  }

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return 'Invalid date';
  }

  return `${formatElapsedTimeRangeValue(fromMs, zeroMs)} to ${formatElapsedTimeRangeValue(toMs, zeroMs)}`;
}

// function formatElapsedTimeRange(value: TimeRange): string {
//   const fromMs = value.from.valueOf();
//   const toMs = value.to.valueOf();
//   const zeroMs = getElapsedTimePickerZeroMs(value);

//   return `${formatElapsedTimeRangeValue(fromMs, zeroMs)} to ${formatElapsedTimeRangeValue(toMs, zeroMs)}`;
// }

function clampElapsedTimeRangeToZero(value: TimeRange): TimeRange {
  if (!isElapsedTimeModeEnabled()) {
    return value;
  }

  const zeroMs = getElapsedZeroMsFromUrl();

  if (zeroMs == null) {
    return value;
  }

  const fromMs = value.from.valueOf();
  const toMs = value.to.valueOf();

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return value;
  }

  const span = toMs - fromMs;

  if (!Number.isFinite(span) || span <= 0) {
    return value;
  }

  if (fromMs >= zeroMs) {
    return value;
  }

  const clampedFromMs = zeroMs;
  const clampedToMs = zeroMs + span;

  if (!Number.isFinite(clampedFromMs) || !Number.isFinite(clampedToMs)) {
    return value;
  }

  const clampedFrom = dateTime(clampedFromMs);
  const clampedTo = dateTime(clampedToMs);

  return {
    ...value,
    from: clampedFrom,
    to: clampedTo,
    raw: {
      from: clampedFrom,
      to: clampedTo,
    },
  };
}

export interface State {
  isOpen: boolean;
}

/**
 * https://developers.grafana.com/ui/latest/index.html?path=/docs/date-time-pickers-timerangepicker--docs
 */
export function TimeRangePicker(props: TimeRangePickerProps) {
  const [isOpen, setOpen] = useState(false);

  const {
    value,
    onMoveBackward,
    onMoveForward,
    moveForwardTooltip,
    moveBackwardTooltip,
    onZoom,
    onError,
    timeZone,
    fiscalYearStartMonth,
    history,
    onChangeTimeZone,
    onChangeFiscalYearStartMonth,
    quickRanges,
    hideQuickRanges,
    widthOverride,
    isOnCanvas,
    onToolbarTimePickerClick,
    weekStart,
    initialIsSynced,
  } = props;

  const { onChangeWithSync, isSynced, timeSyncButton } = useTimeSync({
    initialIsSynced,
    value,
    onChangeProp: props.onChange,
    isSyncedProp: props.isSynced,
    timeSyncButtonProp: props.timeSyncButton,
  });

  const onChange = (timeRange: TimeRange) => {
    onChangeWithSync(clampElapsedTimeRangeToZero(timeRange));
    setOpen(false);
  };

  // useEffect(() => {
  //   if (!isElapsedTimeModeEnabled()) {
  //     return;
  //   }

  //   const zeroMs = getElapsedZeroMsFromUrl();

  //   if (zeroMs == null) {
  //     return;
  //   }

  //   const fromMs = value.from.valueOf();
  //   const toMs = value.to.valueOf();

  //   if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
  //     return;
  //   }

  //   if (fromMs >= zeroMs) {
  //     return;
  //   }

  //   const clampedValue = clampElapsedTimeRangeToZero(value);

  //   if (clampedValue.from.valueOf() !== fromMs || clampedValue.to.valueOf() !== toMs) {
  //     onChangeWithSync(clampedValue);
  //   }
  // }, [value, onChangeWithSync]);

  useEffect(() => {
    if (isOpen && onToolbarTimePickerClick) {
      onToolbarTimePickerClick();
    }
  }, [isOpen, onToolbarTimePickerClick]);

  const onToolbarButtonSwitch = () => {
    setOpen((prevState) => !prevState);
  };

  const onClose = () => {
    setOpen(false);
  };

  const overlayRef = createRef<HTMLElement>();
  const buttonRef = createRef<HTMLElement>();
  const { overlayProps, underlayProps } = useOverlay(
    {
      onClose,
      isDismissable: true,
      isOpen,
      shouldCloseOnInteractOutside: (element) => {
        const portalContainer = getPortalContainer();
        return !buttonRef.current?.contains(element) && !portalContainer.contains(element);
      },
    },
    overlayRef
  );
  const { dialogProps } = useDialog({}, overlayRef);

  const styles = useStyles2(getStyles);
  const { modalBackdrop } = useStyles2(getModalStyles);

  const variant = isSynced ? 'active' : isOnCanvas ? 'canvas' : 'default';

  const isFromAfterTo = value?.to?.isBefore(value.from);
  const timePickerIcon = isFromAfterTo ? 'exclamation-triangle' : 'clock-nine';

  const currentTimeRange = formattedRange(value, timeZone, quickRanges);

  const onMoveBackwardClamped = () => {
    if (!isElapsedTimeModeEnabled()) {
      onMoveBackward();
      return;
    }

    const zeroMs = getElapsedZeroMsFromUrl();

    if (zeroMs == null) {
      onMoveBackward();
      return;
    }

    const fromMs = value.from.valueOf();
    const toMs = value.to.valueOf();

    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      return;
    }

    const span = toMs - fromMs;

    if (!Number.isFinite(span) || span <= 0) {
      return;
    }

    // Grafana's normal back button shifts by half of the current range.
    const shiftMs = span / 2;

    let nextFromMs = fromMs - shiftMs;
    let nextToMs = toMs - shiftMs;

    // If moving back crosses elapsed zero, clamp to 00:00
    // and preserve the full current span.
    if (nextFromMs < zeroMs) {
      nextFromMs = zeroMs;
      nextToMs = zeroMs + span;
    }

    const nextFrom = dateTime(nextFromMs);
    const nextTo = dateTime(nextToMs);

    onChangeWithSync({
      ...value,
      from: nextFrom,
      to: nextTo,
      raw: {
        from: nextFrom,
        to: nextTo,
      },
    });
  };

  const onZoomClamped = () => {
    if (!isElapsedTimeModeEnabled()) {
      onZoom();
      return;
    }

    const zeroMs = getElapsedZeroMsFromUrl();

    if (zeroMs == null) {
      onZoom();
      return;
    }

    const fromMs = value.from.valueOf();
    const toMs = value.to.valueOf();

    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      return;
    }

    const span = toMs - fromMs;

    if (!Number.isFinite(span) || span <= 0) {
      return;
    }

    // Same basic behavior as zoom-out: expand range around current range
    const nextSpan = span * 2;
    const nextFromMs = fromMs - span / 2;

    const clampedFromMs = Math.max(nextFromMs, zeroMs);
    const clampedToMs = clampedFromMs + nextSpan;

    const clampedFrom = dateTime(clampedFromMs);
    const clampedTo = dateTime(clampedToMs);

    onChangeWithSync({
      ...value,
      from: clampedFrom,
      to: clampedTo,
      raw: {
        from: clampedFrom,
        to: clampedTo,
      },
    });
  };

  return (
    <ButtonGroup className={styles.container}>
      <ToolbarButton
        variant={variant}
        // onClick={onMoveBackward}
        onClick={onMoveBackwardClamped}
        icon="angle-double-left"
        type="button"
        iconSize="xl"
        data-testid={selectors.components.TimePicker.moveBackwardButton}
        tooltip={
          moveBackwardTooltip ?? t('time-picker.range-picker.backwards-time-aria-label', 'Move time range backwards')
        }
        narrow
      />

      <Tooltip
        ref={buttonRef}
        content={<TimePickerTooltip timeRange={value} timeZone={timeZone} />}
        placement="bottom"
        interactive
      >
        <ToolbarButton
          data-testid={selectors.components.TimePicker.openButton}
          aria-label={t('time-picker.range-picker.current-time-selected', 'Time range selected: {{currentTimeRange}}', {
            currentTimeRange,
          })}
          aria-controls="TimePickerContent"
          onClick={onToolbarButtonSwitch}
          icon={timePickerIcon}
          isOpen={isOpen}
          type="button"
          variant={variant}
        >
          <TimePickerButtonLabel {...props} />
        </ToolbarButton>
      </Tooltip>
      {isOpen && (
        <div data-testid={selectors.components.TimePicker.overlayContent}>
          <div role="presentation" className={cx(modalBackdrop, styles.backdrop)} {...underlayProps} />
          <FocusScope contain autoFocus restoreFocus>
            <section className={styles.content} ref={overlayRef} {...overlayProps} {...dialogProps}>
              <TimePickerContent
                timeZone={timeZone}
                fiscalYearStartMonth={fiscalYearStartMonth}
                value={value}
                onChange={onChange}
                quickOptions={quickRanges || getQuickOptions()}
                history={history}
                showHistory
                widthOverride={widthOverride}
                onChangeTimeZone={onChangeTimeZone}
                onChangeFiscalYearStartMonth={onChangeFiscalYearStartMonth}
                hideQuickRanges={hideQuickRanges}
                onError={onError}
                weekStart={weekStart}
              />
            </section>
          </FocusScope>
        </div>
      )}

      {timeSyncButton}

      <ToolbarButton
        onClick={onMoveForward}
        icon="angle-double-right"
        type="button"
        variant={variant}
        iconSize="xl"
        data-testid={selectors.components.TimePicker.moveForwardButton}
        tooltip={
          moveForwardTooltip ?? t('time-picker.range-picker.forwards-time-aria-label', 'Move time range forwards')
        }
        narrow
      />

      <Tooltip content={ZoomOutTooltip} placement="bottom">
        <ToolbarButton
          aria-label={t('time-picker.range-picker.zoom-out-button', 'Zoom out time range')}
          // onClick={onZoom}
          onClick={onZoomClamped}
          icon="search-minus"
          type="button"
          data-testid={selectors.components.TimePicker.zoomOut}
          variant={variant}
        />
      </Tooltip>
    </ButtonGroup>
  );
}

TimeRangePicker.displayName = 'TimeRangePicker';

const ZoomOutTooltip = () => {
  const newShortcuts = getFeatureToggle('newTimeRangeZoomShortcuts');
  return (
    <>
      {newShortcuts ? (
        <Trans i18nKey="time-picker.range-picker.zoom-out-tooltip-new">
          Time range zoom out <br /> t -
        </Trans>
      ) : (
        <Trans i18nKey="time-picker.range-picker.zoom-out-tooltip">
          Time range zoom out <br /> CTRL+Z
        </Trans>
      )}
    </>
  );
};

export const TimePickerTooltip = ({ timeRange, timeZone }: { timeRange: TimeRange; timeZone?: TimeZone }) => {
  const styles = useStyles2(getLabelStyles);
  const now = Date.now();

  // Get timezone info only if timeZone is provided
  const timeZoneInfo = timeZone ? getTimeZoneInfo(timeZone, now) : undefined;

  return (
    <>
      <div className="text-center">
        {dateTimeFormat(timeRange.from, { timeZone })}
        <div className="text-center">
          <Trans i18nKey="time-picker.range-picker.to">to</Trans>
        </div>
        {dateTimeFormat(timeRange.to, { timeZone })}
      </div>
      <div className={styles.container}>
        <span className={styles.utc}>{timeZoneFormatUserFriendly(timeZone)}</span>
        <TimeZoneDescription info={timeZoneInfo} />
      </div>
    </>
  );
};

type LabelProps = Pick<TimeRangePickerProps, 'hideText' | 'value' | 'timeZone' | 'quickRanges'>;

export const TimePickerButtonLabel = memo<LabelProps>(({ hideText, value, timeZone, quickRanges }) => {
  const styles = useStyles2(getLabelStyles);

  if (hideText) {
    return null;
  }
  const isElapsed = isElapsedTimeModeEnabled();
  return (
    <span className={styles.container} aria-live="polite" aria-atomic="true">
      <span>{formattedRange(value, timeZone, quickRanges)}</span>
      {!isElapsed && <span className={styles.utc}>{rangeUtil.describeTimeRangeAbbreviation(value, timeZone)}</span>}
    </span>
  );
});

TimePickerButtonLabel.displayName = 'TimePickerButtonLabel';

const formattedRange = (value: TimeRange, timeZone?: TimeZone, quickRanges?: TimeOption[]) => {
  if (isElapsedTimeModeEnabled()) {
    return formatElapsedTimeRange(value);
  }

  const matchingOption = quickRanges?.find((option) => {
    return option.from === value.raw.from && option.to === value.raw.to;
  });

  if (matchingOption) {
    return matchingOption.display;
  }

  return mapRangeToTimeOption(value, timeZone).display;
};

const getStyles = (theme: GrafanaTheme2) => {
  return {
    container: css({
      position: 'relative',
      display: 'flex',
      verticalAlign: 'middle',
    }),
    backdrop: css({
      display: 'none',
      [theme.breakpoints.down('sm')]: {
        display: 'block',
      },
    }),
    content: css({
      position: 'absolute',
      right: 0,
      top: '116%',
      zIndex: theme.zIndex.dropdown,

      [theme.breakpoints.down('sm')]: {
        position: 'fixed',
        right: '50%',
        top: '50%',
        transform: 'translate(50%, -50%)',
        zIndex: theme.zIndex.modal,
      },
    }),
  };
};

const getLabelStyles = (theme: GrafanaTheme2) => {
  return {
    container: css({
      display: 'flex',
      alignItems: 'center',
      whiteSpace: 'nowrap',
      columnGap: theme.spacing(0.5),
    }),
    utc: css({
      color: theme.v1.palette.orange,
      fontSize: theme.typography.size.sm,
      paddingLeft: '6px',
      lineHeight: '28px',
      verticalAlign: 'bottom',
      fontWeight: theme.typography.fontWeightMedium,
    }),
  };
};
