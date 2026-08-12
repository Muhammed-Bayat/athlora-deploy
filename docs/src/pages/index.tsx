import Link from '@docusaurus/Link';
import styles from './index.module.css';

export default function Home(): React.JSX.Element {
  return (
    <main className="container container--fluid">
      <section className={styles.hero}>
        <h1 className={styles.title}>Athlora</h1>
        <p className={styles.tagline}>Run the whole season from one place.</p>
        <p className={styles.lede}>
          Manage your roster, plan competitions and training, log results live at the track, and
          derive statistics, PBs and season bests — all from a coach's console.
        </p>
        <div className={styles.actions}>
          <Link className="button button--primary button--lg" to="/docs/">
            Read the docs
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/getting-started/frontend">
            Get started
          </Link>
        </div>
      </section>
    </main>
  );
}