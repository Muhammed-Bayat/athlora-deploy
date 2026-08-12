import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'pb' | 'sb' | 'foul' | 'dq' | 'dnf' | 'dns' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  const classes = [styles.badge, styles[variant]].filter(Boolean).join(' ');
  return <span className={classes}>{children}</span>;
}