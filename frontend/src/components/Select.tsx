import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, SelectHTMLAttributes } from 'react';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  variant?: 'filter' | 'field';
  icon?: 'squad' | 'status';
  dotColors?: Record<string, string>;
}

export function Select({
  id,
  options,
  value,
  onChange,
  variant = 'filter',
  icon,
  dotColors,
  disabled,
  className,
  'aria-label': ariaLabel,
  ...props
}: SelectProps) {
  const fallbackId = useId();
  const selectId = id ?? fallbackId;
  const menuId = `${selectId}-menu`;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? options[0]?.label ?? '',
    [options, value],
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (variant === 'field' || disabled) {
    return (
      <select
        id={selectId}
        ref={selectRef}
        className={[styles.select, className].filter(Boolean).join(' ')}
        value={value ?? ''}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const optionButtons = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];

  const focusOption = (index: number) => {
    const buttons = optionButtons();
    if (buttons.length === 0) return;
    buttons[(index + buttons.length) % buttons.length].focus();
  };

  const pick = (nextValue: string) => {
    const select = selectRef.current;
    if (select) {
      select.value = nextValue;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
      setOpen(true);
      window.requestAnimationFrame(() => {
        if (event.key === 'ArrowDown') focusOption(selectedIndex);
        else focusOption((selectedIndex || options.length) - 1);
      });
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = optionButtons();
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(current + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div ref={wrapperRef} className={[styles.filter, className, open ? styles.filterOpen : ''].filter(Boolean).join(' ')}>
      <select
        id={selectId}
        ref={selectRef}
        className={styles.native}
        tabIndex={-1}
        value={value ?? ''}
        onChange={onChange}
        aria-label={ariaLabel}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {icon && (
        <span className={[styles.icon, icon === 'status' ? styles.statusIcon : ''].filter(Boolean).join(' ')} aria-hidden="true">
          {icon === 'status' ? (
            <span />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="8" r="2.6" />
              <path d="M4.5 18c.2-3 2-4.8 4.5-4.8s4.3 1.8 4.5 4.8" />
              <circle cx="16.8" cy="9" r="2" />
              <path d="M15.2 13.5c2.6.15 4.2 1.8 4.3 4.5" />
            </svg>
          )}
        </span>
      )}
      <button
        type="button"
        ref={triggerRef}
        id={`${selectId}-trigger`}
        className={[styles.trigger, icon ? styles.withIcon : ''].filter(Boolean).join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={styles.triggerLabel}>{selectedLabel}</span>
      </button>
      <div
        id={menuId}
        ref={menuRef}
        className={[styles.menu, open ? styles.menuOpen : ''].filter(Boolean).join(' ')}
        role="listbox"
        aria-labelledby={`${selectId}-trigger`}
        onKeyDown={handleMenuKeyDown}
      >
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            role="option"
            aria-selected={option.value === value}
            className={[styles.option, option.value === value ? styles.selected : ''].filter(Boolean).join(' ')}
            onClick={() => pick(option.value)}
          >
            {dotColors?.[option.value] && (
              <span
                className={styles.optionDot}
                style={{
                  background: dotColors[option.value],
                  boxShadow: `0 0 0 3px ${dotColors[option.value]}26, 0 0 8px ${dotColors[option.value]}40`,
                }}
                aria-hidden="true"
              />
            )}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
