import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import styles from './DatePicker.module.css';

interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  'aria-label': string;
  'aria-describedby'?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toIso(date) === value ? date : null;
}

function dateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export const DatePicker = forwardRef<HTMLButtonElement, DatePickerProps>(function DatePicker(
  { id, value, onChange, disabled = false, invalid = false, required = false, 'aria-label': ariaLabel, 'aria-describedby': describedBy },
  ref,
) {
  const fallbackId = useId();
  const pickerId = id ?? fallbackId;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => triggerRef.current!);
  const selected = parseIso(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const date = selected ?? new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    setMonth(() => {
      const date = parseIso(value) ?? new Date();
      return new Date(date.getFullYear(), date.getMonth(), 1);
    });
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  const days = useMemo(() => {
    const firstWeekday = month.getDay();
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)).map((date) => ({
      date,
      offset: firstWeekday,
    }));
  }, [month]);

  const selectDate = (date: Date) => {
    onChange(toIso(date));
    setOpen(false);
  };

  const moveFocus = (current: string, offset: number) => {
    const currentDate = parseIso(current);
    if (!currentDate) return;
    currentDate.setDate(currentDate.getDate() + offset);
    const next = toIso(currentDate);
    setMonth(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
  };

  const handleCalendarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLButtonElement;
    const date = target.dataset.date;
    if (!date) return;
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in offsets) {
      event.preventDefault();
      moveFocus(date, offsets[event.key]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  const displayValue = selected ? value.replaceAll('-', '/') : 'yyyy/mm/dd';
  const triggerLabel = `${ariaLabel}, ${selected ? dateLabel(selected) : 'no date selected'}`;
  const today = new Date();
  const todayIso = toIso(today);

  return <div ref={rootRef} className={[styles.picker, open ? styles.open : '', invalid ? styles.invalid : ''].filter(Boolean).join(' ')}>
    <button
      ref={triggerRef}
      id={pickerId}
      type="button"
      className={styles.trigger}
      aria-label={triggerLabel}
      aria-describedby={describedBy}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={`${pickerId}-calendar`}
      aria-invalid={invalid || undefined}
      aria-required={required || undefined}
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setOpen(true);
        }
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <span>{displayValue}</span><i aria-hidden="true" />
    </button>
    {open && <div id={`${pickerId}-calendar`} className={styles.calendar} role="dialog" aria-label={`${ariaLabel} calendar`} onKeyDown={handleCalendarKeyDown}>
      <header>
        <strong>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <div><button type="button" aria-label="Previous month" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button><button type="button" aria-label="Next month" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button></div>
      </header>
      <div className={styles.weekdays}>{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className={styles.days}>
        {days.map(({ date, offset }, index) => <button
          type="button"
          key={toIso(date)}
          data-date={toIso(date)}
          style={index === 0 ? { gridColumnStart: offset + 1 } : undefined}
          aria-label={`Choose ${dateLabel(date)}`}
          aria-pressed={toIso(date) === value}
          className={[toIso(date) === value ? styles.selected : '', toIso(date) === todayIso ? styles.today : ''].filter(Boolean).join(' ')}
          onClick={() => selectDate(date)}
        >{date.getDate()}</button>)}
      </div>
      <footer><button type="button" onClick={() => { onChange(''); setOpen(false); }}>Clear</button><button type="button" onClick={() => selectDate(today)}>Today</button></footer>
    </div>}
  </div>;
});
