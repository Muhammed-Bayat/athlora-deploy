import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export type CardTone = 'default' | 'ink' | 'flat';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  children?: ReactNode;
}

export function Card({ tone = 'default', className, children, ...props }: CardProps) {
  const classes = [styles.card, tone !== 'default' ? styles[tone] : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}