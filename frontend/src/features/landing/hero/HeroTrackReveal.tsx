import { useEffect, useRef } from 'react';
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
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="presentation">
            <defs>
              <linearGradient id="athloraLaneKey" gradientUnits="userSpaceOnUse" x1="360" y1="770" x2="1320" y2="210">
                <stop offset="0" stopColor="#0A536A" />
                <stop offset="0.38" stopColor="#55C9DB" />
                <stop offset="0.60" stopColor="#E8FEFF" />
                <stop offset="0.73" stopColor="#8AE9F2" />
                <stop offset="1" stopColor="#176B86" />
              </linearGradient>
              <linearGradient id="athloraLaneHot" gradientUnits="userSpaceOnUse" x1="330" y1="790" x2="1280" y2="190">
                <stop offset="0" stopColor="#2B869B" />
                <stop offset="0.43" stopColor="#A7F5FA" />
                <stop offset="0.59" stopColor="#FFFFFF" />
                <stop offset="0.72" stopColor="#BFFBFE" />
                <stop offset="1" stopColor="#3298B0" />
              </linearGradient>
              <linearGradient id="athloraTrackRim" gradientUnits="userSpaceOnUse" x1="420" y1="760" x2="1250" y2="230">
                <stop offset="0" stopColor="#00364B" />
                <stop offset="0.46" stopColor="#1686A1" />
                <stop offset="0.62" stopColor="#55D3E2" />
                <stop offset="1" stopColor="#06465E" />
              </linearGradient>
            </defs>
            <g transform="rotate(-8 800 450)">
              <ellipse className={styles.shadowBed} cx="815" cy="514" rx="680" ry="310" />
              <ellipse className={styles.bed} cx="815" cy="500" rx="680" ry="310" />
              <ellipse className={styles.bedHi} cx="815" cy="494" rx="680" ry="310" />

              <ellipse className={styles.infieldShadow} cx="815" cy="510" rx="574" ry="212" />
              <ellipse className={styles.infield} cx="815" cy="500" rx="574" ry="212" />
              <ellipse className={styles.infieldHi} cx="815" cy="496" rx="566" ry="204" />

              <g>
                <g transform="translate(0 6)">
                  <path className={styles.throwDepth} d="M1070 486 L491 336" />
                  <path className={styles.throwDepth} d="M1070 514 L491 664" />
                  <path className={styles.throwDepth} d="M886.2 548.8 A195 195 0 0 1 886.2 451.2" />
                  <path className={styles.throwDepth} d="M823.3 565.0 A260 260 0 0 1 823.3 435.0" />
                  <path className={styles.throwDepth} d="M760.3 581.3 A325 325 0 0 1 760.3 418.7" />
                  <path className={styles.throwDepth} d="M697.4 597.5 A390 390 0 0 1 697.4 402.5" />
                  <path className={styles.throwDepth} d="M634.5 613.8 A455 455 0 0 1 634.5 386.2" />
                  <path className={styles.throwDepth} d="M571.5 630.0 A520 520 0 0 1 571.5 370.0" />
                  <path className={styles.throwDepth} d="M508.6 646.3 A585 585 0 0 1 508.6 353.7" />
                  <path className={styles.throwArcDepth} d="M1071 482 Q1059 500 1071 518" />
                  <rect className={styles.runwayShadow} x="1072" y="483" width="244" height="34" rx="4" />
                </g>

                <rect className={styles.runway} x="1072" y="483" width="244" height="34" rx="4" />
                <path className={styles.throwLineMajor} d="M1070 486 L491 336" />
                <path className={styles.throwLineMajor} d="M1070 514 L491 664" />
                <path className={styles.throwGuide} d="M886.2 548.8 A195 195 0 0 1 886.2 451.2" />
                <path className={styles.throwGuideMajor} d="M823.3 565.0 A260 260 0 0 1 823.3 435.0" />
                <path className={styles.throwGuide} d="M760.3 581.3 A325 325 0 0 1 760.3 418.7" />
                <path className={styles.throwGuideMajor} d="M697.4 597.5 A390 390 0 0 1 697.4 402.5" />
                <path className={styles.throwGuide} d="M634.5 613.8 A455 455 0 0 1 634.5 386.2" />
                <path className={styles.throwGuideMajor} d="M571.5 630.0 A520 520 0 0 1 571.5 370.0" />
                <path className={styles.throwGuide} d="M508.6 646.3 A585 585 0 0 1 508.6 353.7" />
                <path className={styles.throwArc} d="M1071 482 Q1059 500 1071 518" />
                <path className={styles.throwGuide} d="M1066 500 L500 500" />
                <text className={styles.throwNum} x="811" y="488">40</text><text className={styles.throwUnit} x="836" y="488">m</text>
                <text className={styles.throwNum} x="746" y="488">50</text><text className={styles.throwUnit} x="771" y="488">m</text>
                <text className={styles.throwNum} x="681" y="488">60</text><text className={styles.throwUnit} x="706" y="488">m</text>
                <text className={styles.throwNum} x="616" y="488">70</text><text className={styles.throwUnit} x="641" y="488">m</text>
                <text className={styles.throwNum} x="551" y="488">80</text><text className={styles.throwUnit} x="576" y="488">m</text>
                <text className={styles.throwNum} x="486" y="488">90</text><text className={styles.throwUnit} x="511" y="488">m</text>
              </g>

              <g transform="translate(0 7)">
                <ellipse className={styles.laneDepth} cx="815" cy="500" rx="768" ry="398" />
                <ellipse className={styles.laneDepth} cx="815" cy="500" rx="746" ry="376" />
                <ellipse className={styles.laneDepth} cx="815" cy="500" rx="724" ry="354" />
                <ellipse className={styles.laneDepth} cx="815" cy="500" rx="702" ry="332" />
                <ellipse className={styles.laneDepth} cx="815" cy="500" rx="680" ry="310" />
                <ellipse className={styles.laneDepth} cx="815" cy="500" rx="658" ry="288" />
                <ellipse className={styles.laneDepth} cx="815" cy="500" rx="636" ry="266" />
                <ellipse className={styles.laneDepth} cx="815" cy="500" rx="614" ry="244" />
                <ellipse className={styles.laneDepth} cx="815" cy="500" rx="592" ry="222" />
                <path className={styles.startDepth} d="M1451 293 L1517 647" />
              </g>

              <ellipse className={styles.laneHot} cx="815" cy="500" rx="768" ry="398" />
              <ellipse className={styles.lane} cx="815" cy="500" rx="746" ry="376" />
              <ellipse className={styles.lane} cx="815" cy="500" rx="724" ry="354" />
              <ellipse className={styles.laneHot} cx="815" cy="500" rx="702" ry="332" />
              <ellipse className={styles.lane} cx="815" cy="500" rx="680" ry="310" />
              <ellipse className={styles.lane} cx="815" cy="500" rx="658" ry="288" />
              <ellipse className={styles.laneHot} cx="815" cy="500" rx="636" ry="266" />
              <ellipse className={styles.lane} cx="815" cy="500" rx="614" ry="244" />
              <ellipse className={styles.lane} cx="815" cy="500" rx="592" ry="222" />

              <path className={styles.startLine} d="M1451 293 L1517 647" />
              <path className={styles.mark} d="M1357 260 L1420 630" />
              <path className={styles.mark} d="M1267 242 L1324 610" />
              <path className={styles.mark} d="M1177 232 L1228 592" />
              <path className={styles.mark} d="M1090 230 L1135 574" />
              <path className={styles.mark} d="M1005 236 L1044 556" />

              <g transform="translate(1390 410) rotate(77)">
                <text className={styles.laneNum} x="0" y="0">1</text>
                <text className={styles.laneNum} x="0" y="23">2</text>
                <text className={styles.laneNum} x="0" y="46">3</text>
                <text className={styles.laneNum} x="0" y="69">4</text>
                <text className={styles.laneNum} x="0" y="92">5</text>
                <text className={styles.laneNum} x="0" y="115">6</text>
                <text className={styles.laneNum} x="0" y="138">7</text>
                <text className={styles.laneNum} x="0" y="161">8</text>
              </g>
            </g>
          </svg>
        </div>
      </div>
    </>
  );
}
