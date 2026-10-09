import Link from '@docusaurus/Link';
import styles from './index.module.css';

export default function Home(): React.JSX.Element {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Athletics coaching platform</p>
        <h1 className={styles.title}>Athlora</h1>
        <p className={styles.tagline}>Run the whole season from one place.</p>
        <p className={styles.lede}>
          A React coaching console, Express API, and PostgreSQL database for roster management,
          multi-discipline meets, live logging, derived results, and public club surfaces.
        </p>
        <div className={styles.actions}>
          <Link className="button button--primary button--lg" to="/docs/getting-started/frontend">
            Run locally
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/architecture/product-experience">
            Explore the product
          </Link>
        </div>
      </section>
      <section className={styles.grid} aria-label="Documentation sections">
        <Link className={styles.card} to="/docs/getting-started/frontend">
          <span>01</span><h2>Getting started</h2><p>Install, configure Auth0 and Postgres, run the stack, and verify it locally.</p>
        </Link>
        <Link className={styles.card} to="/docs/architecture/overview">
          <span>02</span><h2>Product & architecture</h2><p>Understand the coaching workflow, system boundaries, offline model, and API design.</p>
        </Link>
        <Link className={styles.card} to="/docs/testing/overview">
          <span>03</span><h2>Quality</h2><p>Review automated tests, accessibility, responsiveness, performance practice, and feedback evidence.</p>
        </Link>
        <Link className={styles.card} to="/docs/quality/deployment-data">
          <span>04</span><h2>Operations</h2><p>See deployments, seeded demonstration data, database operations, security boundaries, and service limits.</p>
        </Link>
      </section>
      <section className={styles.links}>
        <a href="https://athlora-deploy.vercel.app">Application</a>
        <a href="https://athlora-deploy.onrender.com/health">API health</a>
        <Link to="/docs/db-schema/overview">Database schema</Link>
        <Link to="/docs/project-methodology/methodology">Team methodology</Link>
      </section>
    </main>
  );
}
