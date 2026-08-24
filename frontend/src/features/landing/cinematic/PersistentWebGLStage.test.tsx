import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PersistentWebGLStage } from './PersistentWebGLStage';

describe('PersistentWebGLStage', () => {
  it('keeps the DOM-only landing fallback when WebGL is unavailable', () => {
    const progressRef = { current: 0 };

    const { container } = render(<PersistentWebGLStage progressRef={progressRef} />);

    expect(container.querySelector('canvas')).not.toBeInTheDocument();
  });
});
