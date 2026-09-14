import { useEffect, useRef } from 'react';
import { TrackArtwork } from '../TrackArtwork';
import styles from './HeroTrackReveal.module.css';

const REVEAL_HALF = 190; // 380px circular compositor window with a static feather mask.
const GLOW_HALF = 195;

/**
 * The approved landing hero track, ported exactly from the SDP-Landing mockup
 * (the #trackReveal/#trackScene SVG). A soft circular window follows the pointer
 * while the full track scene moves by the exact inverse amount, so the track stays
 * spatially fixed as the window reveals it. Purely decorative (aria-hidden) and
 * disabled on coarse pointers, compact layouts and reduced motion.
 */
export function HeroTrackReveal() {
  const glowRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = document.getElementById('top');
    const glow = glowRef.current;
    const reveal = revealRef.current;
    const scene = sceneRef.current;
    if (!hero || !glow || !reveal || !scene) return;
    if (typeof window.matchMedia !== 'function') return;

    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const compactQuery = window.matchMedia('(max-width: 900px)');
    const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (reducedQuery.matches || compactQuery.matches || !finePointerQuery.matches) return;

    let heroRect: DOMRect | null = null;
    let pointerX = 0;
    let pointerY = 0;
    let pointerInside = false;
    let heroFrame = 0;

    const refreshHeroRect = () => {
      heroRect = hero.getBoundingClientRect();
      scene.style.width = `${heroRect.width}px`;
      scene.style.height = `${heroRect.height}px`;
    };

    const renderHeroPointer = () => {
      heroFrame = 0;
      if (!heroRect) refreshHeroRect();
      if (!heroRect) return;
      if (!pointerInside) {
        glow.style.opacity = '0';
        reveal.style.opacity = '0';
        return;
      }
      const localX = Math.max(0, Math.min(heroRect.width, pointerX - heroRect.left));
      const localY = Math.max(0, Math.min(heroRect.height, pointerY - heroRect.top));
      glow.style.opacity = '1';
      glow.style.transform = `translate3d(${(localX - GLOW_HALF).toFixed(1)}px,${(localY - GLOW_HALF).toFixed(1)}px,0)`;
      reveal.style.opacity = '.82';
      reveal.style.transform = `translate3d(${(localX - REVEAL_HALF).toFixed(1)}px,${(localY - REVEAL_HALF).toFixed(1)}px,0)`;
      scene.style.transform = `translate3d(${(REVEAL_HALF - localX).toFixed(1)}px,${(REVEAL_HALF - localY).toFixed(1)}px,0)`;
    };

    const schedule = () => {
      if (!heroFrame) heroFrame = requestAnimationFrame(renderHeroPointer);
    };

    const onEnter = (event: PointerEvent) => {
      refreshHeroRect();
      pointerInside = true;
      pointerX = event.clientX;
      pointerY = event.clientY;
      schedule();
    };
    const onMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerInside = true;
      schedule();
    };
    const onLeave = () => {
      pointerInside = false;
      schedule();
    };
    const onResize = () => {
      refreshHeroRect();
      schedule();
    };

    refreshHeroRect();
    hero.addEventListener('pointerenter', onEnter, { passive: true });
    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerleave', onLeave, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      hero.removeEventListener('pointerenter', onEnter);
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
      if (heroFrame) window.cancelAnimationFrame(heroFrame);
    };
  }, []);

  return (
    <>
      <div ref={glowRef} className={styles.cursorGlow} aria-hidden="true" />
      <div ref={revealRef} className={styles.reveal} aria-hidden="true">
        <div ref={sceneRef} className={styles.scene}>
          <TrackArtwork cls={styles} />
        </div>
      </div>
    </>
  );
}
