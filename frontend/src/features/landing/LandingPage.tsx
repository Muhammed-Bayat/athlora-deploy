import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import styles from './LandingExperience.module.css';

const PersistentWebGLStage = lazy(() =>
  import('./cinematic/PersistentWebGLStage').then((module) => ({ default: module.PersistentWebGLStage })),
);

type PreviewTab = 'athletes' | 'events' | 'trend';

const chapters = [
  ['top', 'Start'],
  ['squad', 'The squad'],
  ['product', 'Athlora'],
  ['events', 'The season'],
  ['trend', 'Performance'],
  ['fitness', 'Athlete intelligence'],
  ['system', 'The whole season'],
  ['faq', 'FAQ'],
] as const;

const storyStops = [
  ['top', 0],
  ['squad', .14],
  ['product', .3],
  ['events', .46],
  ['trend', .59],
  ['fitness', .73],
  ['system', .86],
  ['cta', 1],
] as const;

const previewTabs = [
  ['athletes', 'Athletes'],
  ['events', 'Events'],
  ['trend', 'Trend'],
] as const;

const faqs = [
  ['Who is Athlora built for?', 'Athlora is built for athletics coaches running a squad, from club and school coaches to performance staff managing a full season.'],
  ['What can I actually track?', 'Rosters with discipline, squad and status; personal bests and trial history; meets, time trials and training camps; and a live squad performance trend.'],
  ['Do my athletes need an account?', "No. Athlora is a coach-facing console. You manage the roster, calendar and trends without asking athletes to adopt another app."],
  ['Can I import an existing roster?', 'Yes. Start with your existing squad, then keep athlete, event and performance context connected as the season develops.'],
  ['Is there a cost to get started?', 'Create an account and set up your squad at no cost to try Athlora.' ],
] as const;

function Icon({ name }: { name: 'arrow' | 'signal' | 'calendar' | 'trend' }) {
  const paths: Record<string, ReactNode> = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    signal: <path d="M3 12h3l2.4-6 3.4 12 2.6-8H21" />,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4m8-4v4M3 10h18" /></>,
    trend: <path d="M3 19 9 13l4 3 8-10M3 4v15h18" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={styles.brand}><img src="/logo-removebg.png" alt="" /><span><b>Athlora</b>{!compact && <small>Performance OS</small>}</span></span>;
}

function AccountButton({ children, primary = false, onClick }: { children: ReactNode; primary?: boolean; onClick: () => void }) {
  const followPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--button-x', `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty('--button-y', `${event.clientY - bounds.top}px`);
  };
  return <button type="button" className={`${styles.button} ${primary ? styles.primary : styles.secondary}`} onClick={onClick} onPointerMove={primary ? followPointer : undefined}><span className={styles.buttonLabel}>{children}</span></button>;
}

function ProductPanel({ activeTab, onTabChange }: { activeTab: PreviewTab; onTabChange: (tab: PreviewTab) => void }) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, current: PreviewTab) => {
    const currentIndex = previewTabs.findIndex(([id]) => id === current);
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? previewTabs.length - 1 : direction ? (currentIndex + direction + previewTabs.length) % previewTabs.length : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = previewTabs[nextIndex][0];
    onTabChange(next);
    document.getElementById(`landing-tab-${next}`)?.focus();
  };

  return <div className={styles.productPanel} aria-label="Athlora product preview">
    <div className={styles.productTop}><span><i /><i /><i /></span><b><i />Live squad view</b><small>Season 2026</small></div>
    <div className={styles.productMetrics}><span><b>24</b>Athletes</span><span><b>06</b>Events next</span><span><b>09</b>PBs this month</span></div>
    <div className={styles.tabs} role="tablist" aria-label="Product preview">
      {previewTabs.map(([id, label]) => <button key={id} id={`landing-tab-${id}`} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`landing-panel-${id}`} tabIndex={activeTab === id ? 0 : -1} onClick={() => onTabChange(id)} onKeyDown={(event) => handleKeyDown(event, id)}>{label}</button>)}
    </div>
    <div className={styles.panelBody}>
      <div id="landing-panel-athletes" role="tabpanel" aria-labelledby="landing-tab-athletes" hidden={activeTab !== 'athletes'}>
        {[['JL', 'Jordan Lee', '100m sprint', '10.86s'], ['MS', 'Mia Santos', '400m sprint', '54.20s'], ['EA', 'Efe Adeyemi', '200m sprint', '21.14s']].map(([initials, name, event, pb]) => <div className={styles.dataRow} key={name}><span>{initials}</span><p><b>{name}</b><small>{event}</small></p><strong>{pb}</strong></div>)}
      </div>
      <div id="landing-panel-events" role="tabpanel" aria-labelledby="landing-tab-events" hidden={activeTab !== 'events'}>
        {[['14 Aug', 'Sprint & Hurdles Trial', 'Home track'], ['24 Aug', 'Altitude Training Camp', 'Highland base'], ['19 Sep', 'Coastal Relays', 'Bay City stadium']].map(([date, name, place]) => <div className={styles.eventRow} key={name}><b>{date}</b><p><strong>{name}</strong><small>{place}</small></p></div>)}
      </div>
      <div id="landing-panel-trend" role="tabpanel" aria-labelledby="landing-tab-trend" hidden={activeTab !== 'trend'}>
        <div className={styles.trendReadout}><span>100m sprint group</span><b>8pt improvement / 7 trials</b></div><svg viewBox="0 0 460 150" preserveAspectRatio="none" aria-label="Squad performance improving over seven trials"><path className={styles.chartGrid} d="M0 50h460M0 100h460" /><path className={styles.chartFill} d="M0 120 66 104 132 110 198 75 264 84 330 45 396 56 460 22v128H0Z" /><path className={styles.chartLine} d="M0 120 66 104 132 110 198 75 264 84 330 45 396 56 460 22" /><circle cx="460" cy="22" r="4" /></svg>
      </div>
    </div>
  </div>;
}

interface LandingPageProps {
  onLogin: () => void;
  onSignup: () => void;
  onPasswordHelp: () => void;
}

export function LandingPage({ onLogin, onSignup, onPasswordHelp }: LandingPageProps) {
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches).current;
  const pageRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const storyPositionsRef = useRef<number[]>([]);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [activeTab, setActiveTab] = useState<PreviewTab>('athletes');
  const [activeChapter, setActiveChapter] = useState('top');
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [introVisible, setIntroVisible] = useState(!reducedMotion);
  const [typedCount, setTypedCount] = useState(reducedMotion ? 32 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    const introTimer = window.setTimeout(() => setIntroVisible(false), 2000);
    return () => window.clearTimeout(introTimer);
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion || introVisible) return;
    const typeTimer = window.setInterval(() => setTypedCount((count) => {
      if (count >= 32) {
        window.clearInterval(typeTimer);
        return count;
      }
      return count + 1;
    }), 42);
    return () => window.clearInterval(typeTimer);
  }, [introVisible, reducedMotion]);

  useEffect(() => {
    let frame = 0;
    const measureStory = () => {
      storyPositionsRef.current = storyStops.map(([id], index) => {
        const element = document.getElementById(id);
        return element?.offsetTop || index * window.innerHeight;
      });
    };
    const update = () => {
      frame = 0;
      const positions = storyPositionsRef.current;
      const scroll = window.scrollY + window.innerHeight * .34;
      let index = 0;
      while (index < positions.length - 1 && scroll >= positions[index + 1]) index += 1;
      const start = positions[index] ?? 0;
      const end = positions[index + 1] ?? start + window.innerHeight;
      const segmentProgress = Math.min(1, Math.max(0, (scroll - start) / Math.max(1, end - start)));
      const progress = storyStops[index][1] + ((storyStops[index + 1]?.[1] ?? 1) - storyStops[index][1]) * segmentProgress;
      progressRef.current = progress;
      pageRef.current?.style.setProperty('--story-progress', progress.toFixed(4));
      const productIn = Math.min(1, Math.max(0, (progress - .24) / .12));
      const productOut = Math.min(1, Math.max(0, (progress - .43) / .12));
      pageRef.current?.style.setProperty('--product-y', `${Math.round((1 - productIn) * 120 - productOut * 72)}px`);
      pageRef.current?.style.setProperty('--product-rotate', `${-14 * (1 - productIn) + productOut * 4}deg`);
      pageRef.current?.style.setProperty('--product-opacity', `${Math.min(1, productIn * 1.35)}`);
      const marker = window.scrollY + window.innerHeight * .48;
      let current = 'top';
      chapters.forEach(([id]) => { if ((document.getElementById(id)?.offsetTop ?? Infinity) <= marker) current = id; });
      setActiveChapter((value) => value === current ? value : current);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    measureStory();
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    const resize = () => { measureStory(); schedule(); };
    window.addEventListener('resize', resize);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(document.body);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', resize); observer?.disconnect(); };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = menuButtonRef.current;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = pageRef.current?.querySelectorAll<HTMLElement>('#landing-mobile-menu button, #landing-mobile-menu a[href]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); trigger?.focus(); };
  }, [menuOpen]);

  const fullTitle = 'Track the squad.\nRun the season.';
  const visibleTitle = fullTitle.slice(0, typedCount);
  const lineBreak = visibleTitle.indexOf('\n');
  const firstLine = lineBreak === -1 ? visibleTitle : visibleTitle.slice(0, lineBreak);
  const secondLine = lineBreak === -1 ? '' : visibleTitle.slice(lineBreak + 1);

  return <div className={styles.page} ref={pageRef}>
    <Suspense fallback={null}><PersistentWebGLStage progressRef={progressRef} /></Suspense>
    <div className={styles.staticAtmosphere} aria-hidden="true"><i /><i /><i /></div>
    {introVisible && <div className={styles.intro} aria-hidden="true"><div><span>Athletics coaching · performance system</span><strong>ATHLORA</strong><i /><small>Run the whole season from one place</small></div></div>}
    <header className={styles.header}><nav className={styles.nav} aria-label="Landing page"><a href="#top" className={styles.brandLink} aria-label="Athlora home"><Brand /></a><div className={styles.desktopActions}><AccountButton onClick={onLogin}>Log in</AccountButton><AccountButton primary onClick={onSignup}>Get started</AccountButton></div><button ref={menuButtonRef} className={styles.menuButton} type="button" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="landing-mobile-menu" onClick={() => setMenuOpen(true)}><span /></button></nav></header>
    {menuOpen && <div id="landing-mobile-menu" className={styles.mobileMenu} role="dialog" aria-modal="true" aria-label="Navigation menu"><div><Brand compact /><button ref={closeButtonRef} type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>+</button></div><nav aria-label="Mobile landing page">{chapters.slice(1).map(([id, label]) => <a href={`#${id}`} key={id} onClick={() => setMenuOpen(false)}>{label}</a>)}</nav><AccountButton onClick={onLogin}>Log in</AccountButton><AccountButton primary onClick={onSignup}>Get started</AccountButton><button type="button" className={styles.passwordButton} onClick={onPasswordHelp}>Forgot password</button></div>}
    <aside className={styles.chapterRail} aria-label="Story chapters">{chapters.slice(0, -1).map(([id, label]) => <a key={id} href={`#${id}`} aria-current={activeChapter === id ? 'location' : undefined}><span />{label}</a>)}</aside>
    <main>
      <section id="top" className={`${styles.chapter} ${styles.hero}`} aria-labelledby="landing-title"><div className={styles.chapterContent}><p className={styles.eyebrow}>Athletics coaching, in motion</p><h1 id="landing-title" aria-label="Track the squad. Run the season."><span aria-hidden="true">{firstLine || '\u00a0'}<br />{secondLine.startsWith('Run the ') ? <>Run the <em>{secondLine.slice(8)}</em></> : secondLine}<i className={typedCount < fullTitle.length ? styles.caret : ''} /></span></h1><p className={styles.heroCopy}>One calm, connected place for every athlete, every trial and every decision that carries a season forward.</p><div className={styles.actions}><AccountButton primary onClick={onSignup}>Get started free <Icon name="arrow" /></AccountButton><a className={`${styles.button} ${styles.secondary}`} href="#product">See Athlora in motion</a></div></div><p className={styles.scrollPrompt} aria-hidden="true">Scroll to enter the track <i /></p></section>
      <section id="squad" className={`${styles.chapter} ${styles.squad}`} aria-labelledby="squad-title"><div className={styles.chapterContent}><p className={styles.eyebrow}>The squad</p><h2 id="squad-title">One squad.<br />Every athlete visible.</h2><p>Follow readiness, personal bests and momentum as signals moving through the same world, instead of scattered across spreadsheets.</p><div className={styles.athleteMoments}><article><b>Jordan Lee</b><span>100m sprint · 10.86s PB</span><i>Peaking</i></article><article><b>Mia Santos</b><span>400m sprint · 54.20s PB</span><i>On track</i></article><article><b>Efe Adeyemi</b><span>200m sprint · 21.14s PB</span><i>Peaking</i></article></div></div></section>
      <section id="product" className={`${styles.chapter} ${styles.product}`} aria-labelledby="product-title"><div className={styles.productLayout}><div className={styles.productCopy}><p className={styles.eyebrow}>The coach's console</p><h2 id="product-title">The season comes into focus.</h2><p>Athlora emerges when the world needs a decision. Read the roster, calendar and trend without leaving the story.</p></div><ProductPanel activeTab={activeTab} onTabChange={setActiveTab} /></div></section>
      <section id="events" className={`${styles.chapter} ${styles.events}`} aria-labelledby="events-title"><div className={styles.chapterContent}><p className={styles.eyebrow}>Meets and training</p><h2 id="events-title">Move through the season,<br />not a list of dates.</h2><p>Trials, camps and competition appear as milestones ahead on the track, with the detail close when it matters.</p><div className={styles.eventMoments}><span><Icon name="signal" /><b>Training</b><small>Tuesday · 16:30</small></span><span><Icon name="calendar" /><b>Time trial</b><small>Saturday · 09:00</small></span></div></div></section>
      <section id="trend" className={`${styles.chapter} ${styles.trend}`} aria-labelledby="trend-title"><div className={styles.chapterContent}><p className={styles.eyebrow}>Track to trend</p><h2 id="trend-title">Every lane tells a<br />performance story.</h2><p>The work on track becomes the curve you use to understand what comes next.</p><div className={styles.metricLine}><span>100m sprint group</span><b>11.47 <i>→</i> 11.24 PB</b></div><a className={`${styles.button} ${styles.secondary}`} href="/console/stats">Explore season statistics</a></div></section>
      <section id="fitness" className={`${styles.chapter} ${styles.fitness}`} aria-labelledby="fitness-title"><div className={styles.chapterContent}><p className={styles.eyebrow}>Athlete intelligence</p><h2 id="fitness-title">See more than<br />performance.</h2><p>Fitness and injury context remains attached to the athlete, grounded in verified anatomy rather than a separate report.</p><p className={styles.anatomyNote}><span />Left knee · moderate signal</p></div></section>
      <section id="system" className={`${styles.chapter} ${styles.system}`} aria-labelledby="system-title"><div className={styles.chapterContent}><p className={styles.eyebrow}>One connected system</p><h2 id="system-title">The entire season,<br />in one place.</h2><p>Roster decisions, planned events and performance context stay connected from first session to final meet.</p><ol className={styles.systemSteps}><li><b>01</b> Build the squad</li><li><b>02</b> Shape the season</li><li><b>03</b> Read the trend</li></ol></div></section>
      <section id="cta" className={`${styles.chapter} ${styles.cta}`} aria-labelledby="cta-title"><div className={styles.ctaContent}><p className={styles.eyebrow}>Your next lap starts here</p><h2 id="cta-title">Ready to run the season?</h2><p>Set up your squad in minutes and make every session count.</p><div className={styles.actions}><AccountButton primary onClick={onSignup}>Get started free <Icon name="arrow" /></AccountButton><AccountButton onClick={onLogin}>I already have an account</AccountButton></div></div></section>
      <section id="faq" className={styles.faqSection} aria-labelledby="faq-title"><div><p className={styles.eyebrow}>Questions</p><h2 id="faq-title">Before the starting line.</h2>{faqs.map(([question, answer], index) => { const open = openFaq === index; return <article key={question}><h3><button type="button" id={`landing-faq-button-${index}`} aria-expanded={open} aria-controls={`landing-faq-${index}`} onClick={() => setOpenFaq(open ? null : index)}>{question}<span aria-hidden="true">+</span></button></h3><div id={`landing-faq-${index}`} role="region" aria-labelledby={`landing-faq-button-${index}`} hidden={!open}><p>{answer}</p></div></article>; })}</div></section>
    </main>
    <footer className={styles.footer}><div><Brand /><p>The coach's console for rosters, PBs, meets and training camps. Built for the track, not a spreadsheet.</p></div><nav aria-label="Footer"><a href="#squad">The squad</a><a href="#product">The product</a><a href="#faq">FAQ</a><button type="button" onClick={onPasswordHelp}>Forgot password</button><a href="/docs/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a><a href="/docs/legal/terms" target="_blank" rel="noopener noreferrer">Terms</a></nav><small>© {new Date().getFullYear()} Athlora Athletics Coaching.</small></footer>
    {reducedMotion && <span className={styles.reducedMotionNotice}>Motion reduced</span>}
  </div>;
}
