import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import styles from './LandingPage.module.css';

type PreviewTab = 'athletes' | 'events' | 'trend';

const previewTabs = [
  ['athletes', 'people', 'Athletes'],
  ['events', 'calendar', 'Events'],
  ['trend', 'chart', 'Trend'],
] as const;

const features = [
  {
    icon: 'people',
    title: 'Roster & PBs',
    body: "Every athlete's discipline, squad, status and personal best in one searchable list - filter by squad or who's peaking before a taper.",
  },
  {
    icon: 'calendar',
    title: 'Meets & training camps',
    body: 'Time trials, away meets and training camps on one calendar, with athletes assigned per event so nobody misses a call-up.',
  },
  {
    icon: 'chart',
    title: 'Squad PB trend',
    body: "A live read on how the squad's trial times are trending, so you can see momentum building well before a meet.",
  },
  {
    icon: 'clock',
    title: 'Live squad status',
    body: "Peaking, on-track or recovering - every athlete's status is visible at a glance from the sidebar, updated as training moves.",
  },
  {
    icon: 'edit',
    title: 'Athlete profiles & notes',
    body: "Training focus, upcoming events and coaching notes live on each athlete's profile - one tap away from the roster.",
  },
  {
    icon: 'pulse',
    title: 'Season-wide dashboard',
    body: 'Active athletes, events in the next 14 days and PBs broken this month, summarised the moment you sign in.',
  },
] as const;

const faqs = [
  {
    question: 'Who is Athlora built for?',
    answer:
      'Athlora is built for athletics coaches running a squad - club coaches, school coaches and performance staff who need to track athletes, PBs and a season calendar without stitching together spreadsheets.',
  },
  {
    question: 'What can I actually track?',
    answer:
      'Rosters with discipline, squad and status; personal bests and trial history per athlete; meets, time trials and training camps with assigned athletes; and a live squad PB trend so you can see form building.',
  },
  {
    question: 'Do my athletes need an account?',
    answer:
      "No. Athlora is a coach-facing console - you manage the roster, the calendar and the trends. Athletes don't need to sign up or log anything themselves.",
  },
  {
    question: 'Can I import an existing roster?',
    answer:
      'Yes - add athletes individually as you go, or bring across an existing roster when you get started so nothing has to be re-typed from scratch.',
  },
  {
    question: 'Is there a cost to get started?',
    answer: 'Create an account and set up your squad at no cost to try it out - head to Get started to begin.',
  },
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
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

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

  return <svg {...common}>{paths[name]}</svg>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={styles.brand}>
      <img src="/logo-removebg.png" alt="" />
      <span className={styles.brandText}>
        <span className={styles.brandWord}>Athlora</span>
        {!compact && <span className={styles.brandTag}>Athletics Coaching</span>}
      </span>
    </span>
  );
}

function AccountButton({ children, primary = false, light = false, large = false }: { children: ReactNode; primary?: boolean; light?: boolean; large?: boolean }) {
  return (
    <button
      type="button"
      className={`${styles.button} ${primary ? styles.buttonPrimary : light ? styles.buttonLight : styles.buttonGhost} ${large ? styles.buttonLarge : ''}`}
    >
      {children}
    </button>
  );
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PreviewTab>('athletes');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
      if (event.key !== 'Tab') return;
      const menu = closeButtonRef.current?.closest('[role="dialog"]');
      const focusable = menu?.querySelectorAll<HTMLElement>('button, a[href]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      menuButton?.focus();
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

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

  return (
    <div className={styles.page} id="top">
      <header className={styles.topNav}>
        <div className={styles.navInner}>
          <a className={styles.brandLink} href="#top" aria-label="Athlora home"><Brand /></a>
          <nav className={styles.navLinks} aria-label="Landing page">
            <a href="#features">Product</a>
            <a href="#preview">How it looks</a>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className={styles.navActions}>
            <AccountButton>Log in</AccountButton>
            <AccountButton primary>Get started</AccountButton>
            <button
              ref={menuButtonRef}
              className={styles.navToggle}
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              onClick={() => setMenuOpen(true)}
            ><span /></button>
          </div>
        </div>
      </header>

      <div className={styles.lanes} aria-hidden="true" />

      <div
        id="landing-mobile-menu"
        className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!menuOpen}
      >
        <div className={styles.mobileTop}>
          <Brand compact />
          <button ref={closeButtonRef} className={styles.mobileClose} type="button" aria-label="Close menu" onClick={closeMenu} />
        </div>
        <nav className={styles.mobileLinks} aria-label="Mobile landing page">
          <a href="#features" onClick={closeMenu}>Product</a>
          <a href="#preview" onClick={closeMenu}>How it looks</a>
          <a href="#how" onClick={closeMenu}>How it works</a>
          <a href="#faq" onClick={closeMenu}>FAQ</a>
        </nav>
        <div className={styles.mobileActions}>
          <AccountButton large>Log in</AccountButton>
          <AccountButton primary large>Get started</AccountButton>
        </div>
      </div>

      <main>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroInner}>
            <div>
              <p className={styles.heroBadge}><span />Built for track & field coaches</p>
              <h1 id="landing-title">Track the squad.<br />Run the <span>season.</span></h1>
              <p className={styles.lede}>Athlora replaces the spreadsheet, the group chat and the notebook in your kit bag with one live console - rosters, PBs, meets and training camps, updated in real time.</p>
              <div className={styles.heroActions}>
                <AccountButton primary large>Get started free <Icon name="arrow" /></AccountButton>
                <a className={`${styles.button} ${styles.buttonGhost} ${styles.buttonLarge} ${styles.onDark}`} href="#preview">See it in action</a>
              </div>
              <dl className={styles.heroMeta}>
                <div><dt>128</dt><dd>Athletes tracked</dd></div>
                <div><dt>342</dt><dd>PBs logged this season</dd></div>
                <div><dt>26</dt><dd>Meets scheduled</dd></div>
              </dl>
            </div>

            <div className={styles.heroVisual} aria-label="Example live squad console">
              <div className={`${styles.floatChip} ${styles.floatChipOne}`}>✦ PB broken - Efe A.</div>
              <div className={styles.consoleCard}>
                <div className={styles.consoleTopbar}>
                  <span className={styles.consoleDots}><i /><i /><i /></span>
                  <span className={styles.live}><i />Live squad view</span>
                </div>
                <div className={styles.tickGrid}>
                  <div><strong>24</strong><span>Athletes</span></div>
                  <div><strong>6</strong><span>Events, 14d</span></div>
                  <div><strong>9</strong><span>Season PBs</span></div>
                </div>
                <div className={styles.spark}>
                  <span>Squad PB trend - last 7 trials</span>
                  <svg viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true">
                    <defs><linearGradient id="landingSparkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--cyan-400)" stopOpacity=".5"/><stop offset="100%" stopColor="var(--cyan-400)" stopOpacity="0"/></linearGradient></defs>
                    <path className={styles.sparkFill} d="M0 34 34 28 68 32 102 20 136 24 170 12 204 16 240 4V44H0Z"/>
                    <path className={styles.sparkLine} d="M0 34 34 28 68 32 102 20 136 24 170 12 204 16 240 4"/>
                  </svg>
                </div>
                <div className={styles.rosterStrip}>
                  {[['JL', 'Jordan Lee', '10.86s', 'Peaking'], ['MS', 'Mia Santos', '54.2s', 'On track'], ['EA', 'Efe Adeyemi', '21.14s', 'Peaking']].map((row) => (
                    <div className={styles.rosterRow} key={row[0]}><span className={styles.avatar}>{row[0]}</span><strong>{row[1]}</strong><code>{row[2]}</code><small>{row[3]}</small></div>
                  ))}
                </div>
              </div>
              <div className={`${styles.floatChip} ${styles.floatChipTwo}`}>▣ Trial added - Sat</div>
            </div>
          </div>
        </section>

        <div className={styles.marqueeWrap} aria-label="Athlora capabilities">
          <div className={styles.marquee}>
            {[0, 1].map((copy) => <span key={copy} aria-hidden={copy === 1}>{['Rosters', 'Personal bests', 'Meets & trials', 'Training camps', 'Squad trends', 'Season planning'].map((item) => <b key={item}>{item}</b>)}</span>)}
          </div>
        </div>

        <section id="features" className={styles.section} aria-labelledby="features-title">
          <div className={styles.wrap}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>What Athlora does</p>
              <h2 id="features-title">Everything a coach juggles, in one console.</h2>
              <p>Athlora isn't a generic team app with a stopwatch icon bolted on. Every screen is built around what actually happens on a track: who's peaking, what's next on the calendar, and how the numbers are trending.</p>
            </div>
            <div className={styles.featureGrid}>
              {features.map((feature) => <article className={styles.featureCard} key={feature.title}><span className={styles.featureIcon}><Icon name={feature.icon} /></span><h3>{feature.title}</h3><p>{feature.body}</p></article>)}
            </div>
          </div>
        </section>

        <section id="preview" className={`${styles.section} ${styles.whiteSection}`} aria-labelledby="preview-title">
          <div className={styles.wrap}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Take a look</p>
              <h2 id="preview-title">This is what your squad looks like inside Athlora.</h2>
              <p>A stripped-down look at the actual console - switch tabs the same way you would once you're signed in.</p>
            </div>
            <div className={styles.preview}>
              <div className={styles.previewTabs} role="tablist" aria-label="Product preview">
                {previewTabs.map(([id, icon, label]) => (
                  <button key={id} id={`landing-tab-${id}`} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`landing-panel-${id}`} tabIndex={activeTab === id ? 0 : -1} className={activeTab === id ? styles.activeTab : ''} onClick={() => setActiveTab(id)} onKeyDown={(event) => handleTabKeyDown(event, id)}><Icon name={icon} /><span>{label}</span></button>
                ))}
              </div>
              <div className={styles.previewBody}>
                <div id="landing-panel-athletes" role="tabpanel" aria-labelledby="landing-tab-athletes" tabIndex={0} hidden={activeTab !== 'athletes'}>
                  {athletes.map(([initials, name, discipline, pb, status]) => <div className={styles.previewRow} key={name}><span className={styles.previewAvatar}>{initials}</span><span><strong>{name}</strong><small>{discipline}</small></span><span className={styles.previewRight}><code>{pb}</code><em>{status}</em></span></div>)}
                </div>
                <div id="landing-panel-events" role="tabpanel" aria-labelledby="landing-tab-events" tabIndex={0} hidden={activeTab !== 'events'}>
                  {events.map(([day, month, name, location, type, tone]) => <div className={styles.previewEvent} key={name}><span className={styles.previewDate}><strong>{day}</strong><small>{month}</small></span><span><strong>{name}</strong><small>{location}</small></span><em className={styles[tone]}>{type}</em></div>)}
                </div>
                <div id="landing-panel-trend" role="tabpanel" aria-labelledby="landing-tab-trend" tabIndex={0} hidden={activeTab !== 'trend'}>
                  <div className={styles.trend}><div><strong>Squad PB trend</strong><span>▲ 8pt improvement / 7 trials</span></div><svg viewBox="0 0 460 150" preserveAspectRatio="none" aria-label="Squad performance improving over seven trials"><defs><linearGradient id="landingTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--blue-500)" stopOpacity=".22"/><stop offset="100%" stopColor="var(--blue-500)" stopOpacity="0"/></linearGradient></defs><path className={styles.trendArea} d="M0 110 66 96 132 104 198 70 264 80 330 44 396 54 460 20V150H0Z"/><path className={styles.trendLine} d="M0 110 66 96 132 104 198 70 264 80 330 44 396 54 460 20"/><circle cx="460" cy="20" r="5"/></svg></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className={styles.section} aria-labelledby="how-title">
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.center}`}><p className={styles.eyebrow}>Getting started</p><h2 id="how-title">Up and running before the next session.</h2><p>No onboarding calls, no importing a wall of spreadsheets by hand.</p></div>
            <ol className={styles.steps}>
              <li><span>01</span><h3>Build your squad</h3><p>Add athletes with their discipline, squad and current PB. Import a roster or add them one by one as trials happen.</p></li>
              <li><span>02</span><h3>Lay out the season</h3><p>Drop in meets, time trials and training camps, and assign the athletes who need to be there.</p></li>
              <li><span>03</span><h3>Watch the trend</h3><p>Every trial you log feeds the squad dashboard, so you always know who's peaking and who needs a lighter week.</p></li>
            </ol>
          </div>
        </section>

        <section className={`${styles.section} ${styles.noTop}`} aria-label="Coach testimonial">
          <div className={styles.wrap}><figure className={styles.quoteBand}><span className={styles.quoteIcon}><Icon name="layers" /></span><div><blockquote>“I used to run the squad off three spreadsheets and a group chat. Now I open one dashboard before every session and I know exactly who's peaking and what's on this week.”</blockquote><figcaption>Head coach, club athletics programme</figcaption></div></figure></div>
        </section>

        <section id="faq" className={`${styles.section} ${styles.whiteSection}`} aria-labelledby="faq-title">
          <div className={styles.wrap}>
            <div className={`${styles.sectionHead} ${styles.center}`}><p className={styles.eyebrow}>Questions</p><h2 id="faq-title">Before you get started</h2></div>
            <div className={styles.faq}>
              {faqs.map((faq, index) => {
                const open = openFaq === index;
                return <article className={`${styles.faqItem} ${open ? styles.faqOpen : ''}`} key={faq.question}><h3><button type="button" aria-expanded={open} aria-controls={`landing-faq-${index}`} onClick={() => setOpenFaq(open ? null : index)}>{faq.question}<span aria-hidden="true" /></button></h3><div className={styles.faqAnswer} id={`landing-faq-${index}`} hidden={!open}><p>{faq.answer}</p></div></article>;
              })}
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.noTop}`} aria-labelledby="cta-title">
          <div className={styles.wrap}><div className={styles.ctaBand}><h2 id="cta-title">Ready to run the season?</h2><p>Set up your squad in minutes and see the dashboard fill in as trials happen.</p><div className={styles.ctaActions}><AccountButton light large>Get started free</AccountButton><AccountButton large>I already have an account</AccountButton></div></div></div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footerTop}>
            <div className={styles.footerBrand}><Brand /><p>The coach's console for rosters, PBs, meets and training camps - built for the track, not a spreadsheet.</p></div>
            <div className={styles.footerCol}><h2>Product</h2><a href="#features">Features</a><a href="#preview">Preview</a><a href="#how">How it works</a></div>
            <div className={styles.footerCol}><h2>Account</h2><button type="button">Log in</button><button type="button">Get started</button><button type="button">Forgot password</button></div>
            <div className={styles.footerCol}><h2>Company</h2><a href="#faq">FAQ</a><span>About</span><span>Contact</span></div>
          </div>
          <div className={styles.footerBottom}><span>© {new Date().getFullYear()} Athlora Athletics Coaching. All rights reserved.</span><span>Built for coaches who'd rather be on the track.</span></div>
        </div>
      </footer>
    </div>
  );
}
