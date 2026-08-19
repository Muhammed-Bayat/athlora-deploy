import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroTrackReveal } from './HeroTrackReveal';

describe('HeroTrackReveal', () => {
  it('renders the approved track artwork with lanes, start line and javelin sector', () => {
    const { container } = render(<HeroTrackReveal />);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('viewBox', '0 0 1600 900');

    const labels = [...(container.querySelectorAll('text') ?? [])].map((node) => node.textContent);
    expect(labels).toEqual(expect.arrayContaining(['1', '8', '40', '90']));

    const laneFaces = container.querySelectorAll('ellipse');
    expect(laneFaces.length).toBeGreaterThanOrEqual(9);
  });

  it('is decorative and never interactive', () => {
    const { container } = render(<HeroTrackReveal />);
    expect(container.querySelector('[aria-hidden]')).not.toBeNull();
    expect(container.querySelector('button, a, input, [tabindex]')).toBeNull();
  });
});