import { usePwaInstall } from '../hooks/usePwaInstall';
import styles from './InstallButton.module.css';

export function InstallButton() {
  const { isInstallable, isInstalled, install } = usePwaInstall();

  if (isInstalled || !isInstallable) {
    return null;
  }

  return (
    <button
      type="button"
      className={styles.installButton}
      onClick={install}
      aria-label="Install Athlora app"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M8 1v10M4 7l4 4 4-4M2 13h12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Install App
    </button>
  );
}