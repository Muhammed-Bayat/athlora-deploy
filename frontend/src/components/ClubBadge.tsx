import type { ClubBrandSummary, ClubBranding } from '../types';
import { clubInitials, pickForeground } from '../utils/colorContrast';
import styles from './ClubBadge.module.css';

export type ClubBadgeSize = 'sm' | 'md' | 'lg';

export interface ClubBadgeProps {
  name: string;
  branding?: ClubBrandSummary | null;
  size?: ClubBadgeSize;
  className?: string;
  decorative?: boolean;
}

export function ClubBadge({ name, branding, size = 'md', className, decorative }: ClubBadgeProps) {
  const logoUrl = branding?.logoUrl ?? null;
  const primaryColor = branding?.primaryColor ?? null;
  const background = primaryColor ?? undefined;
  const color = primaryColor ? pickForeground(primaryColor) : undefined;
  const classes = [styles.badge, styles[size], className].filter(Boolean).join(' ');

  if (logoUrl) {
    return (
      <span
        className={`${classes} ${styles.hasLogo}`}
        data-size={size}
        title={decorative ? undefined : name}
      >
        <img src={logoUrl} alt={decorative ? '' : `${name} logo`} />
      </span>
    );
  }

  return (
    <span
      className={classes}
      data-size={size}
      style={background ? { background, color } : undefined}
      title={decorative ? undefined : name}
      role={decorative ? 'presentation' : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative ? true : undefined}
    >
      {clubInitials(name)}
    </span>
  );
}

export type { ClubBranding };
