import { useEffect, useRef } from 'react';
import { TrackArtwork } from '../TrackArtwork';
import styles from './TrackExperience.module.css';
import {
  cameraTransform,
  clamp01,
  findTrackOpacity,
  lapWindow,
  objectTransform,
  droneRig,
} from './trackMath';

/**
 * The SDP-Landing cinematic chase-camera track, ported exactly from the mockup.
 * A shared SVG oval is mounted inside a two-layer wrapper: the `object` translates
 * by the negative runner position while the `camera` holds an oblique drone pitch,
 * bend-dependent bank and yaw. One lap spans The Squad to the lower page, the whole
 * layer fades per section, and it is hidden on small screens and for reduced motion.
 */
export function TrackExperience() {
  const layerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const objectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const camera = cameraRef.current;
    const object = objectRef.current;
    const features = document.getElementById('features');
    const footer = document.querySelector('footer');
    if (!layer || !camera || !object || !features || !footer) return;
    if (typeof window.matchMedia !== 'function') return;

    const compactQuery = window.matchMedia('(max-width: 900px)');
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const disabled = () => compactQuery.matches || reducedQuery.matches;

    let featuresTop = 0;
    let footerTop = 0;
    let sceneTops: number[] = [];
    const sceneOpacities = [0.23, 0.2, 0.15, 0.075];

    const refreshMetrics = () => {
      const pageY = window.scrollY;
      featuresTop = features.getBoundingClientRect().top + pageY;
      footerTop = footer.getBoundingClientRect().top + pageY;
      sceneTops = ['features', 'preview', 'how', 'faq']
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null)
        .map((el) => el.getBoundingClientRect().top + pageY);
    };

    const trackStartY = () => Math.max(0, featuresTop - window.innerHeight * 0.05);

    let targetScrollY = window.scrollY || window.pageYOffset || 0;
    let smoothScrollY = targetScrollY;
    let cinFrame = 0;
    let lastFrameTime = performance.now();
    let trackVisible: boolean | null = null;

    const setTrackVisible = (visible: boolean) => {
      if (trackVisible === visible) return;
      trackVisible = visible;
      layer.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) layer.style.opacity = '0';
    };

    const renderCinematic = (sy: number) => {
      const actualScrollY = window.scrollY || window.pageYOffset || 0;
      const startY = trackStartY();
      const trackAllowed = actualScrollY >= startY;
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      setTrackVisible(trackAllowed);

      const squadEntrance = trackAllowed ? clamp01((sy - startY) / (vh * 0.3)) : 0;
      const trackOpacity = trackAllowed
        ? findTrackOpacity(Math.max(featuresTop + 1, sy + vh * 0.18), sceneTops, sceneOpacities) * squadEntrance
        : 0;

      if (trackAllowed) {
        const { progress } = lapWindow(sy, featuresTop, footerTop, vh);
        layer.style.opacity = trackOpacity.toFixed(3);
        const rig = droneRig(progress, vw, vh);
        camera.style.transform = cameraTransform(rig);
        object.style.transform = objectTransform(progress);
      }
    };

    const animate = (now: number) => {
      cinFrame = 0;
      const dt = Math.min(34, Math.max(1, now - lastFrameTime));
      lastFrameTime = now;
      const smoothing = 1 - Math.exp(-dt / 82);
      smoothScrollY += (targetScrollY - smoothScrollY) * smoothing;
      if (Math.abs(targetScrollY - smoothScrollY) < 0.08) smoothScrollY = targetScrollY;
      renderCinematic(smoothScrollY);
      if (Math.abs(targetScrollY - smoothScrollY) > 0.08) {
        cinFrame = requestAnimationFrame(animate);
      }
    };

    const schedule = () => {
      targetScrollY = window.scrollY || window.pageYOffset || 0;
      if (disabled()) {
        setTrackVisible(false);
        if (cinFrame) {
          cancelAnimationFrame(cinFrame);
          cinFrame = 0;
        }
        return;
      }
      if (targetScrollY < trackStartY()) {
        smoothScrollY = targetScrollY;
        setTrackVisible(false);
        if (cinFrame) {
          cancelAnimationFrame(cinFrame);
          cinFrame = 0;
        }
        renderCinematic(smoothScrollY);
        return;
      }
      setTrackVisible(true);
      if (!cinFrame) {
        lastFrameTime = performance.now();
        cinFrame = requestAnimationFrame(animate);
      }
    };

    const onResize = () => {
      refreshMetrics();
      targetScrollY = window.scrollY || window.pageYOffset || 0;
      smoothScrollY = targetScrollY;
      setTrackVisible(targetScrollY >= trackStartY());
      renderCinematic(smoothScrollY);
    };

    refreshMetrics();
    if (!disabled()) {
      setTrackVisible(targetScrollY >= trackStartY());
      renderCinematic(smoothScrollY);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    compactQuery.addEventListener('change', onResize);
    reducedQuery.addEventListener('change', onResize);

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      compactQuery.removeEventListener('change', onResize);
      reducedQuery.removeEventListener('change', onResize);
      if (cinFrame) cancelAnimationFrame(cinFrame);
    };
  }, []);

  return (
    <div ref={layerRef} className={styles.layer} aria-hidden="true">
      <div ref={cameraRef} className={styles.camera}>
        <div ref={objectRef} className={styles.object}>
          <TrackArtwork cls={styles} />
        </div>
      </div>
    </div>
  );
}