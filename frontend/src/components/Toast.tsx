import type { ReactNode } from 'react';
import { Button } from './Button';
import styles from './Toast.module.css';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastProps {
  variant?: ToastVariant;
  onDismiss: () => void;
  children: ReactNode;
}

export function Toast({ variant = 'info', onDismiss, children }: ToastProps) {
  const classes = [styles.toast, styles[variant]].filter(Boolean).join(' ');
  return (
    <div className={classes} role="status" aria-live="polite">
      <span>{children}</span>
      <Button variant="ghost" aria-label="Dismiss" onClick={onDismiss}>
        ×
      </Button>
    </div>
  );
}