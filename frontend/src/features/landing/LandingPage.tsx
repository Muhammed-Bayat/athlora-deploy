import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import styles from './LandingPage.module.css';
import { HeroTrackReveal } from './hero/HeroTrackReveal';

const TrackExperience = lazy(() =>
  import('./three/TrackExperience').then((module) => ({ default: module.TrackExperience })),
);

type PreviewTab = 'athletes' | 'events' | 'trend';

const previewTabs = [
  ['athletes', 'people', 'Athletes'],
  ['events', 'calendar', 'Events'],
  ['trend', 'chart', 'Trend'],
] as const;

const sections = [
  ['top', '01 · Start', 'Start'],
  ['features', '02 · The squad', 'The squad'],
  ['preview', '03 · Live console', 'Live console'],
  ['how', '04 · Workflow', 'How it works'],
  ['faq', '05 · FAQ', 'FAQ'],
] as const;

const features = [
  ['people', 'Roster & PBs', "Every athlete's discipline, squad, status and personal best in one searchable list - filter by squad or who's peaking before a taper."],
  ['calendar', 'Meets & training camps', 'Time trials, away meets and training camps on one calendar, with athletes assigned per event so nobody misses a call-up.'],
  ['chart', 'Squad PB trend', "A live read on how the squad's trial times are trending, so you can see momentum building well before a meet."],
  ['clock', 'Live squad status', "Peaking, on-track or recovering - every athlete's status is visible at a glance from the sidebar, updated as training moves."],
  ['edit', 'Athlete profiles & notes', "Training focus, upcoming events and coaching notes live on each athlete's profile - one tap away from the roster."],
  ['pulse', 'Season-wide dashboard', 'Active athletes, events in the next 14 days and PBs broken this month, summarised the moment you sign in.'],
] as const;

const faqs = [
  ['Who is Athlora built for?', 'Athlora is built for athletics coaches running a squad - club coaches, school coaches and performance staff who need to track athletes, PBs and a season calendar without stitching together spreadsheets.'],
  ['What can I actually track?', 'Rosters with discipline, squad and status; personal bests and trial history per athlete; meets, time trials and training camps with assigned athletes; and a live squad PB trend so you can see form building.'],
  ['Do my athletes need an account?', "No. Athlora is a coach-facing console - you manage the roster, the calendar and the trends. Athletes don't need to sign up or log anything themselves."],
  ['Can I import an existing roster?', 'Yes - add athletes individually as you go, or bring across an existing roster when you get started so nothing has to be re-typed from scratch.'],
  ['Is there a cost to get started?', 'Create an account and set up your squad at no cost to try it out - head to Get started to begin.'],
] as const;

const athletes = [
  ['JL', 'Jordan Lee', '100m · Sprint squad', '10.86s', 'Peaking'],
  ['MS', 'Mia Santos', '400m · Sprint squad', '54.20s', 'On track'],
  ['EA', 'Efe Adeyemi', '200m · Sprint squad', '21.14s', 'Peaking'],
  ['RK', 'Riya Kapoor', '1500m · Distance squad', '4:31.2', 'On track'],
] as const;

const events = [
  ['14', 'Aug', 'Sprint & Hurdles Time Trial', 'Home Track', 'Time Trial', 'trial'],
  ['24', 'Aug', 'Altitude Training Camp', 'Highland Base', 'Training Camp', 'camp'],
  ['19', 'Sep', 'Coastal Relays', 'Bay City Stadium', 'Meet', 'meet'],
] as const;

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
    chart: <><path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    pulse: <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
    layers: <><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={styles.brand}><img src="/logo-removebg.png" alt=""/><span className={styles.brandText}><span className={styles.brandWord}>Athlora</span>{!compact && <span className={styles.brandTag}>Performance OS</span>}</span></span>;
}

interface AccountButtonProps {
  children: ReactNode;
  primary?: boolean;
  light?: boolean;
  large?: boolean;
  onClick: () => void;
}

function AccountButton({ children, primary, light, large, onClick }: AccountButtonProps) {
  return <button type="button" className={`${styles.button} ${primary ? styles.buttonPrimary : light ? styles.buttonLight : styles.buttonGhost} ${large ? styles.buttonLarge : ''}`} onClick={onClick}>{children}</button>;
}

interface LandingPageProps {
  onLogin: () => void;
  onSignup: () => void;
  onPasswordHelp: () => void;
}

export function LandingPage({ onLogin, onSignup, onPasswordHelp }: LandingPageProps) {
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches).current;
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PreviewTab>('athletes');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [introVisible, setIntroVisible] = useState(!reducedMotion);
  const [typedCount, setTypedCount] = useState(reducedMotion ? 32 : 0);
  const [stats, setStats] = useState(reducedMotion ? [128, 342, 26] : [0, 0, 0]);
  const [activeSection, setActiveSection] = useState('top');
  const [navScrolled, setNavScrolled] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    let typingTimer: number | undefined;
    let statsTimer: number | undefined;
    const introTimer = window.setTimeout(() => {
      setIntroVisible(false);
      typingTimer = window.setInterval(() => setTypedCount((count) => {
        if (count >= 32) {
          window.clearInterval(typingTimer);
          return count;
        }
        return count + 1;
      }), 48);
      statsTimer = window.setInterval(() => setStats((current) => {
        const nextStep = Math.min(40, Math.round((current[0] / 128) * 40) + 1);
        if (nextStep === 40) window.clearInterval(statsTimer);
        return [Math.round(128 * nextStep / 40), Math.round(342 * nextStep / 40), Math.round(26 * nextStep / 40)];
      }), 35);
    }, 3000);
    return () => { window.clearTimeout(introTimer); window.clearInterval(typingTimer); window.clearInterval(statsTimer); };
  }, [reducedMotion]);

  useEffect(() => {
    const root = pageRef.current;
    const revealNodes = root?.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!revealNodes) return;
    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealNodes.forEach((node) => node.classList.add(styles.revealed));
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        (entry.target as HTMLElement).classList.add(styles.revealed);
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
    revealNodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [reducedMotion]);

  useEffect(() => {
    const updateScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      pageRef.current?.style.setProperty('--page-progress', `${Math.min(100, Math.max(0, window.scrollY / max * 100))}%`);
      const heroProgress = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * .82)));
      pageRef.current?.style.setProperty('--hero-copy-y', `${-54 * heroProgress}px`);
      pageRef.current?.style.setProperty('--hero-copy-opacity', `${1 - .62 * heroProgress}`);
      setNavScrolled(window.scrollY > 18);
      const marker = window.scrollY + window.innerHeight * 0.38;
      let current = 'top';
      sections.forEach(([id]) => { if ((document.getElementById(id)?.offsetTop ?? Infinity) <= marker) current = id; });
      setActiveSection((active) => active === current ? active : current);
    };
    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll);
    return () => { window.removeEventListener('scroll', updateScroll); window.removeEventListener('resize', updateScroll); };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = menuButtonRef.current;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = pageRef.current?.querySelectorAll<HTMLElement>('#landing-mobile-menu button, #landing-mobile-menu a[href]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handleKeyDown); trigger?.focus(); };
  }, [menuOpen]);

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, currentTab: PreviewTab) => {
    const currentIndex = previewTabs.findIndex(([id]) => id === currentTab);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % previewTabs.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + previewTabs.length) % previewTabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = previewTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = previewTabs[nextIndex][0];
    setActiveTab(nextTab);
    document.getElementById(`landing-tab-${nextTab}`)?.focus();
  };

  const spotlightFeature = (event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty('--spot-x', `${event.nativeEvent.offsetX}px`);
    event.currentTarget.style.setProperty('--spot-y', `${event.nativeEvent.offsetY}px`);
  };

  const fullTitle = 'Track the squad.\nRun the season.';
  const visibleTitle = fullTitle.slice(0, typedCount);
  const lineBreak = visibleTitle.indexOf('\n');
  const firstLine = lineBreak === -1 ? visibleTitle : visibleTitle.slice(0, lineBreak);
  const secondLine = lineBreak === -1 ? '' : visibleTitle.slice(lineBreak + 1);

  return (
    <div className={styles.page} ref={pageRef}>
      <Suspense fallback={null}><TrackExperience/></Suspense>
      {introVisible && <div className={styles.intro} aria-hidden="true"><div><p>Athletics coaching · performance system</p><strong>ATHLORA</strong><i/><span>Run the whole season from one place</span></div></div>}
      <div className={styles.ambientGrid} aria-hidden="true"/>
      <div className={styles.sceneLabel} aria-hidden="true">{sections.find(([id]) => id === activeSection)?.[1]}</div>
      <div className={styles.pageProgress} aria-hidden="true"><span/></div>
      <nav className={styles.sideNav} aria-label="On this page"><p>On this page</p>{sections.map(([id, , label]) => <a key={id} href={`#${id}`} className={activeSection === id ? styles.sideActive : ''} aria-current={activeSection === id ? 'location' : undefined}>{label}</a>)}</nav>

      <header className={`${styles.topNav} ${navScrolled ? styles.topNavScrolled : ''}`}>
        <nav className={styles.navInner} aria-label="Landing page">
          <a className={styles.brandLink} href="#top" aria-label="Athlora home"><Brand/></a>
          <div className={styles.navActions}>
            <AccountButton onClick={onLogin}>Log in</AccountButton>
            <AccountButton primary onClick={onSignup}>Get started</AccountButton>
            <button ref={menuButtonRef} className={styles.navToggle} type="button" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="landing-mobile-menu" onClick={() => setMenuOpen(true)}><span/></button>
          </div>
        </nav>
      </header>
      <div className={styles.signal} aria-hidden="true"/>

      {menuOpen && <div id="landing-mobile-menu" className={styles.mobileMenu} role="dialog" aria-modal="true" aria-label="Navigation menu">
        <div className={styles.mobileTop}><Brand compact/><button ref={closeButtonRef} className={styles.mobileClose} type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}/></div>
        <nav className={styles.mobileLinks} aria-label="Mobile landing page">{sections.slice(1).map(([id, , label]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}</a>)}</nav>
        <div className={styles.mobileActions}><AccountButton large onClick={onLogin}>Log in</AccountButton><AccountButton primary large onClick={onSignup}>Get started</AccountButton><button type="button" className={styles.passwordButton} onClick={onPasswordHelp}>Forgot password?</button></div>
      </div>}

      <main>
        <section id="top" className={styles.hero} aria-labelledby="landing-title">
          <HeroTrackReveal />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.heroBadge}><span/>Built for track & field coaches</p>
              <h1 id="landing-title" aria-label="Track the squad. Run the season."><span aria-hidden="true">{firstLine || '\u00a0'}<br/>{secondLine.startsWith('Run the ') ? <>Run the <em>{secondLine.slice(8)}</em></> : secondLine}<i className={typedCount < fullTitle.length ? styles.caret : ''}/></span></h1>
              <p className={styles.lede}>Athlora replaces the spreadsheet, the group chat and the notebook in your kit bag with one live console - rosters, PBs, meets and training camps, updated in real time.</p>
              <div className={styles.heroActions}><AccountButton primary large onClick={onSignup}>Get started free <Icon name="arrow"/></AccountButton><a className={`${styles.button} ${styles.buttonGhost} ${styles.buttonLarge}`} href="#preview">See it in action</a></div>
              <dl className={styles.heroMeta}><div><dt>{stats[0]}</dt><dd>Athletes tracked</dd></div><div><dt>{stats[1]}</dt><dd>PBs logged this season</dd></div><div><dt>{stats[2]}</dt><dd>Meets scheduled</dd></div></dl>
            </div>
            <div className={styles.heroVisual} aria-label="Example live squad console">
              <div className={`${styles.floatChip} ${styles.floatOne}`}>✦ PB broken · Efe A.</div>
              <div className={styles.consoleCard}>
                <div className={styles.consoleTop}><span><i/><i/><i/></span><b><i/>Live squad view</b></div>
                <div className={styles.tickGrid}><div><strong>24</strong><span>Athletes</span></div><div><strong>6</strong><span>Events, 14d</span></div><div><strong>9</strong><span>Season PBs</span></div></div>
                <div className={styles.spark}><span>Squad PB trend · last 7 trials</span><svg viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true"><path className={styles.sparkFill} d="M0 34 34 28 68 32 102 20 136 24 170 12 204 16 240 4V44H0Z"/><path className={styles.sparkLine} d="M0 34 34 28 68 32 102 20 136 24 170 12 204 16 240 4"/></svg></div>
                <div className={styles.rosterStrip}>{[['JL', 'Jordan Lee', '10.86s', 'Peaking'], ['MS', 'Mia Santos', '54.2s', 'On track'], ['EA', 'Efe Adeyemi', '21.14s', 'Peaking']].map((row) => <div className={styles.rosterRow} key={row[0]}><span>{row[0]}</span><strong>{row[1]}</strong><code>{row[2]}</code><small>{row[3]}</small></div>)}</div>
              </div>
              <div className={`${styles.floatChip} ${styles.floatTwo}`}>▣ Trial added · Sat</div>
            </div>
          </div>
          <div className={styles.scrollCue} aria-hidden="true"><span>Scroll to explore</span><i/></div>
        </section>

        <div className={styles.marqueeWrap} aria-label="Athlora capabilities"><div className={styles.marquee}>{[0, 1].map((copy) => <div key={copy} aria-hidden={copy === 1}>{['Rosters', 'Personal bests', 'Meets & trials', 'Training camps', 'Squad trends', 'Season planning'].map((item) => <span key={item}>{item}</span>)}</div>)}</div></div>

        <section id="features" className={styles.section} aria-labelledby="features-title"><div className={styles.wrap}>
          <div className={styles.sectionHead} data-reveal><p className={styles.eyebrow}>What Athlora does</p><h2 id="features-title">Everything a coach juggles, in one console.</h2><p>Athlora isn't a generic team app with a stopwatch icon bolted on. Every screen is built around what actually happens on a track: who's peaking, what's next on the calendar, and how the numbers are trending.</p></div>
          <div className={styles.featureGrid}>{features.map(([icon, title, body], index) => <article className={styles.featureCard} style={{ '--delay': `${index * 70}ms` } as CSSProperties} key={title} data-reveal onPointerMove={spotlightFeature}><span className={styles.featureIcon}><Icon name={icon}/></span><h3>{title}</h3><p>{body}</p></article>)}</div>
        </div></section>

        <section id="preview" className={styles.section} aria-labelledby="preview-title"><div className={styles.wrap}>
          <div className={styles.sectionHead} data-reveal><p className={styles.eyebrow}>Take a look</p><h2 id="preview-title">This is what your squad looks like inside Athlora.</h2><p>A stripped-down look at the actual console - switch tabs the same way you would once you're signed in.</p></div>
          <div className={styles.preview} data-reveal>
            <div className={styles.previewTabs} role="tablist" aria-label="Product preview">{previewTabs.map(([id, icon, label]) => <button key={id} id={`landing-tab-${id}`} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`landing-panel-${id}`} tabIndex={activeTab === id ? 0 : -1} className={activeTab === id ? styles.activeTab : ''} onClick={() => setActiveTab(id)} onKeyDown={(event) => handleTabKeyDown(event, id)}><Icon name={icon}/><span>{label}</span></button>)}</div>
            <div className={styles.previewBody}>
              <div id="landing-panel-athletes" role="tabpanel" aria-labelledby="landing-tab-athletes" tabIndex={0} hidden={activeTab !== 'athletes'}>{athletes.map(([initials, name, discipline, pb, status]) => <div className={styles.previewRow} key={name}><span className={styles.previewAvatar}>{initials}</span><span><strong>{name}</strong><small>{discipline}</small></span><span className={styles.previewRight}><code>{pb}</code><em>{status}</em></span></div>)}</div>
              <div id="landing-panel-events" role="tabpanel" aria-labelledby="landing-tab-events" tabIndex={0} hidden={activeTab !== 'events'}>{events.map(([day, month, name, location, type, tone]) => <div className={styles.previewEvent} key={name}><span className={styles.previewDate}><strong>{day}</strong><small>{month}</small></span><span><strong>{name}</strong><small>{location}</small></span><em className={styles[tone]}>{type}</em></div>)}</div>
              <div id="landing-panel-trend" role="tabpanel" aria-labelledby="landing-tab-trend" tabIndex={0} hidden={activeTab !== 'trend'}><div className={styles.trend}><div><strong>Squad PB trend</strong><span>▲ 8pt improvement / 7 trials</span></div><svg viewBox="0 0 460 150" preserveAspectRatio="none" aria-label="Squad performance improving over seven trials"><path className={styles.trendArea} d="M0 110 66 96 132 104 198 70 264 80 330 44 396 54 460 20V150H0Z"/><path className={styles.trendLine} d="M0 110 66 96 132 104 198 70 264 80 330 44 396 54 460 20"/><circle cx="460" cy="20" r="5"/></svg></div></div>
            </div>
          </div>
        </div></section>

        <section id="how" className={styles.section} aria-labelledby="how-title"><div className={styles.wrap}><div className={`${styles.sectionHead} ${styles.center}`} data-reveal><p className={styles.eyebrow}>Getting started</p><h2 id="how-title">Up and running before the next session.</h2><p>No onboarding calls, no importing a wall of spreadsheets by hand.</p></div><ol className={styles.steps}>{[['Build your squad', 'Add athletes with their discipline, squad and current PB. Import a roster or add them one by one as trials happen.'], ['Lay out the season', 'Drop in meets, time trials and training camps, and assign the athletes who need to be there.'], ['Watch the trend', "Every trial you log feeds the squad dashboard, so you always know who's peaking and who needs a lighter week."]].map(([title, body], index) => <li key={title} data-reveal><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></li>)}</ol></div></section>

        <section className={`${styles.section} ${styles.noTop}`} aria-label="Coach testimonial"><div className={styles.wrap}><figure className={styles.quoteBand} data-reveal><span><Icon name="layers"/></span><div><blockquote>“I used to run the squad off three spreadsheets and a group chat. Now I open one dashboard before every session and I know exactly who's peaking and what's on this week.”</blockquote><figcaption>Head coach, club athletics programme</figcaption></div></figure></div></section>

        <section id="faq" className={styles.section} aria-labelledby="faq-title"><div className={styles.wrap}><div className={`${styles.sectionHead} ${styles.center}`} data-reveal><p className={styles.eyebrow}>Questions</p><h2 id="faq-title">Before you get started</h2></div><div className={styles.faq}>{faqs.map(([question, answer], index) => { const open = openFaq === index; return <article className={`${styles.faqItem} ${open ? styles.faqOpen : ''}`} key={question}><h3><button type="button" id={`landing-faq-button-${index}`} aria-expanded={open} aria-controls={`landing-faq-${index}`} onClick={() => setOpenFaq(open ? null : index)}>{question}<span aria-hidden="true"/></button></h3><div className={styles.faqAnswer} id={`landing-faq-${index}`} role="region" aria-labelledby={`landing-faq-button-${index}`} hidden={!open}><p>{answer}</p></div></article>; })}</div></div></section>

        <section className={`${styles.section} ${styles.noTop}`} aria-labelledby="cta-title"><div className={styles.wrap}><div className={styles.ctaBand} data-reveal><h2 id="cta-title">Ready to run the season?</h2><p>Set up your squad in minutes and see the dashboard fill in as trials happen.</p><div><AccountButton light large onClick={onSignup}>Get started free</AccountButton><AccountButton large onClick={onLogin}>I already have an account</AccountButton></div></div></div></section>
      </main>

      <footer className={styles.footer}><div className={styles.wrap}><div className={styles.footerTop}><div className={styles.footerBrand}><Brand/><p>The coach's console for rosters, PBs, meets and training camps - built for the track, not a spreadsheet.</p></div><div className={styles.footerCol}><h2>Product</h2><a href="#features">Features</a><a href="#preview">Preview</a><a href="#how">How it works</a></div><div className={styles.footerCol}><h2>Account</h2><button type="button" onClick={onLogin}>Log in</button><button type="button" onClick={onSignup}>Get started</button><button type="button" onClick={onPasswordHelp}>Forgot password</button></div><div className={styles.footerCol}><h2>Company</h2><a href="#faq">FAQ</a><a href="#top">About</a><a href="#top">Contact</a></div></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} Athlora Athletics Coaching. All rights reserved.</span><span>Built for coaches. Tuned for performance.</span></div></div></footer>
    </div>
  );
}
