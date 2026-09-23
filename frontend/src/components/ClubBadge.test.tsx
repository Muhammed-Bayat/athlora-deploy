import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClubBadge } from './ClubBadge';

describe('ClubBadge', () => {
  it('renders logo when a logo URL is present', () => {
    render(
      <ClubBadge
        name="Open Track Club"
        branding={{ logoUrl: '/api/v1/media/clubs/22222222-2222-4222-8222-222222222222/logo-abc.png' }}
      />,
    );
    const image = screen.getByRole('img', { name: 'Open Track Club logo' });
    expect(image.getAttribute('src')).toContain('/logo-abc.png');
  });

  it('falls back to accessible initials on the primary colour', () => {
    render(<ClubBadge name="Open Track Club" branding={{ primaryColor: '#001D3C' }} />);
    const badge = screen.getByRole('img', { name: 'Open Track Club' });
    expect(badge.textContent).toBe('OT');
    expect(badge.style.background).toBeTruthy();
    expect(badge.style.color).toBeTruthy();
  });

  it('marks decorative badges hidden from assistive technology', () => {
    render(<ClubBadge name="Sprinters" decorative />);
    expect(screen.getByText('SP')).toHaveAttribute('aria-hidden', 'true');
  });
});
