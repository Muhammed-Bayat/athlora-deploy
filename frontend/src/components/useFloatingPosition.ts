import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

interface FloatingPositionOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  floatingRef: RefObject<HTMLElement | null>;
  preferredPlacement?: 'down' | 'up';
  minWidth: number;
  matchAnchorWidth?: boolean;
}

interface FloatingPosition {
  style: CSSProperties;
  placement: 'down' | 'up';
}

const HORIZONTAL_GUTTER = 12;
const VERTICAL_GUTTER = 12;
const GAP = 8;
const MIN_USABLE_SPACE = 144;

function getViewport() {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

export function useFloatingPosition({
  open,
  anchorRef,
  floatingRef,
  preferredPlacement = 'down',
  minWidth,
  matchAnchorWidth = true,
}: FloatingPositionOptions): FloatingPosition {
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const anchor = anchorRef.current;
      const floating = floatingRef.current;
      if (!anchor || !floating) return;

      const anchorRect = anchor.getBoundingClientRect();
      const viewport = getViewport();
      const viewportRight = viewport.left + viewport.width;
      const viewportBottom = viewport.top + viewport.height;
      const availableAbove = Math.max(0, anchorRect.top - viewport.top - VERTICAL_GUTTER - GAP);
      const availableBelow = Math.max(0, viewportBottom - anchorRect.bottom - VERTICAL_GUTTER - GAP);
      const naturalHeight = floating.scrollHeight || 240;
      const preferredSpace = preferredPlacement === 'up' ? availableAbove : availableBelow;
      const alternateSpace = preferredPlacement === 'up' ? availableBelow : availableAbove;
      const placement = preferredSpace >= Math.min(naturalHeight, MIN_USABLE_SPACE) || preferredSpace >= alternateSpace
        ? preferredPlacement
        : preferredPlacement === 'up' ? 'down' : 'up';
      const availableHeight = placement === 'up' ? availableAbove : availableBelow;
      const height = Math.min(naturalHeight, availableHeight);
      const width = Math.min(
        Math.max(minWidth, matchAnchorWidth ? anchorRect.width : minWidth),
        Math.max(0, viewport.width - HORIZONTAL_GUTTER * 2),
      );
      const left = Math.min(
        Math.max(viewport.left + HORIZONTAL_GUTTER, anchorRect.left),
        Math.max(viewport.left + HORIZONTAL_GUTTER, viewportRight - HORIZONTAL_GUTTER - width),
      );
      const top = placement === 'up'
        ? Math.max(viewport.top + VERTICAL_GUTTER, anchorRect.top - GAP - height)
        : anchorRect.bottom + GAP;

      setPosition({
        placement,
        style: {
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          width: `${width}px`,
          maxHeight: `${availableHeight}px`,
          visibility: availableHeight > 0 ? 'visible' : 'hidden',
        },
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    if (floatingRef.current) observer?.observe(floatingRef.current);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      observer?.disconnect();
    };
  }, [anchorRef, floatingRef, matchAnchorWidth, minWidth, open, preferredPlacement]);

  return position ?? {
    placement: preferredPlacement,
    style: { position: 'fixed', top: 0, left: 0, visibility: 'hidden' },
  };
}
