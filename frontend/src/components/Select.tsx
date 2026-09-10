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
  compact?: boolean;
  menuPlacement?: 'down' | 'up';
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  onSearchChange?: (value: string) => void;
}

export function Select({
  id,
  options,
  value,
  onChange,
  variant = 'filter',
  icon,
  dotColors,
  compact = false,
  menuPlacement = 'down',
  placeholder,
  searchable = false,
  searchPlaceholder = 'Search options',
  emptyMessage = 'No matching options',
  onSearchChange,
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
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? placeholder ?? options[0]?.label ?? '',
    [options, placeholder, value],
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open || !searchable) return;
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, searchable]);

  const visibleOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedSearch));
  }, [options, search, searchable]);

  if (variant === 'field') {
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
    if (event.target instanceof HTMLInputElement) return;
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

  const updateSearch = (nextSearch: string) => {
    setSearch(nextSearch);
    onSearchChange?.(nextSearch);
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      focusOption(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      focusOption(-1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div ref={wrapperRef} className={[styles.filter, compact ? styles.compact : '', className, open ? styles.filterOpen : '', disabled ? styles.disabled : ''].filter(Boolean).join(' ')}>
      <select
        id={selectId}
        ref={selectRef}
        className={styles.native}
        tabIndex={-1}
        value={value ?? ''}
        onChange={onChange}
        disabled={disabled}
        {...props}
        aria-hidden="true"
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
        disabled={disabled}
      >
        <span className={styles.triggerLabel}>{selectedLabel}</span>
      </button>
      {open && <div
        id={menuId}
        ref={menuRef}
        className={[styles.menu, menuPlacement === 'up' ? styles.menuUp : '', styles.menuOpen].filter(Boolean).join(' ')}
        role="listbox"
        aria-labelledby={`${selectId}-trigger`}
        onKeyDown={handleMenuKeyDown}
      >
        {searchable && (
          <div className={styles.menuSearch}>
            <input
              ref={searchRef}
              className={styles.searchInput}
              type="search"
              value={search}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              onChange={(event) => updateSearch(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
        )}
        {visibleOptions.map((option) => (
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
        {visibleOptions.length === 0 && (
          <p className={styles.empty} role="status">{emptyMessage}</p>
        )}
      </div>}
    </div>
  );
}
