import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import { createPublicLoggerLink, listPublicLoggerLinks, revokePublicLoggerLink } from '../../api/publicLoggers';
import type { AthleticsEvent, PublicLoggerLink } from '../../types';
import { Button } from '../../components';
import styles from './PublicLoggerPanel.module.css';

export function PublicLoggerPanel({ event }: { event: AthleticsEvent }) {
  const [links, setLinks] = useState<PublicLoggerLink[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligible = event.status === 'scheduled' || event.status === 'in_progress';

  const load = async () => {
    try { setLinks((await listPublicLoggerLinks(event.id)).data); } catch { setError('Could not load public logger links.'); }
  };
  useEffect(() => {
    void listPublicLoggerLinks(event.id)
      .then((response) => setLinks(response.data))
      .catch(() => { /* The event detail remains usable if this supplementary panel cannot load. */ });
  }, [event.id]);
  useEffect(() => {
    if (!shareUrl) {
      setQrCode(null);
      return;
    }
    let current = true;
    void toDataURL(shareUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
      .then((code) => { if (current) setQrCode(code); })
      .catch(() => { if (current) setError('Could not generate the QR code.'); });
    return () => { current = false; };
  }, [shareUrl]);
  const create = async () => {
    setBusy(true); setError(null);
    try { const created = await createPublicLoggerLink(event.id); setShareUrl(`${window.location.origin}/log/${created.token}`); await load(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Could not create a public logger link.'); }
    finally { setBusy(false); }
  };
  const revoke = async (linkId: string) => {
    setBusy(true); setError(null);
    try { await revokePublicLoggerLink(event.id, linkId); if (shareUrl) setShareUrl(null); await load(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Could not revoke this link.'); }
    finally { setBusy(false); }
  };
  const copy = async () => { if (shareUrl) await navigator.clipboard?.writeText(shareUrl); };

  return <section className={styles.panel} aria-labelledby="public-logger-heading"><div><p className={styles.eyebrow}>Shareable logger</p><h2 id="public-logger-heading">Public logging link</h2><p>Share this link or QR code with a meet official. It does not require an Athlora account.</p></div>{error && <p role="alert">{error}</p>}{shareUrl && <div className={styles.share}><label htmlFor="public-logger-url">New link, shown once</label><input id="public-logger-url" value={shareUrl} readOnly /><Button onClick={() => void copy()}>Copy link</Button>{qrCode && <img className={styles.qrCode} src={qrCode} alt="QR code for the public event logger" />}</div>}{eligible ? <Button onClick={() => void create()} disabled={busy}>{busy ? 'Working...' : 'Create shareable link'}</Button> : <p>This event is no longer eligible for new public links.</p>}<ul className={styles.links}>{links.map((link) => <li key={link.id}><span>{link.status === 'active' ? 'Active' : 'Revoked'} · created {new Date(link.createdAt).toLocaleString()}</span>{link.status === 'active' && <Button variant="danger" onClick={() => void revoke(link.id)} disabled={busy}>Revoke</Button>}</li>)}</ul></section>;
}
