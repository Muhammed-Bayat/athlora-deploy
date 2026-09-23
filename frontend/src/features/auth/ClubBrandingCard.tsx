import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  clearClubCover,
  clearClubLogo,
  getClubBranding,
  updateClubBranding,
  uploadClubCover,
  uploadClubLogo,
} from '../../api/clubBranding';
import { ApiError } from '../../api/client';
import { Button, Card, ClubBadge } from '../../components';
import { hasAccessibleForeground, isHexColor, pickForeground } from '../../utils/colorContrast';
import type { ClubBranding } from '../../types';
import { useWorkspace } from './WorkspaceContext';
import styles from './AuthPage.module.css';

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Club branding could not be saved. Please try again.';
}

function colorIssue(value: string): string | null {
  if (!value) return null;
  if (!isHexColor(value)) return 'Use a #RRGGBB colour.';
  if (!hasAccessibleForeground(value)) return 'Colour needs readable white or ink text (WCAG AA 4.5:1).';
  return null;
}

export function ClubBrandingCard() {
  const { activeWorkspace } = useWorkspace();
  const isCoach = activeWorkspace.role === 'coach';
  const [branding, setBranding] = useState<ClubBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const applyBranding = useCallback((next: ClubBranding) => {
    setBranding(next);
    setDescription(next.description ?? '');
    setPrimaryColor(next.primaryColor ?? '');
    setAccentColor(next.accentColor ?? '');
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getClubBranding()
      .then((next) => { if (active) applyBranding(next); })
      .catch((requestError: unknown) => { if (active) setError(message(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activeWorkspace.id, applyBranding]);

  const primaryIssue = colorIssue(primaryColor);
  const accentIssue = colorIssue(accentColor);
  const canSave = Boolean(branding) && !primaryIssue && !accentIssue && !busy;

  const saveDetails = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      applyBranding(await updateClubBranding({
        description: description.trim() || null,
        primaryColor: primaryColor ? primaryColor.toUpperCase() : null,
        accentColor: accentColor ? accentColor.toUpperCase() : null,
      }));
      setStatus('Branding saved.');
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusy(false);
    }
  };

  const handleImage = async (
    event: ChangeEvent<HTMLInputElement>,
    kind: 'logo' | 'cover',
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      setError('Only PNG, JPEG, and WebP images are supported.');
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setError('Image must be 5 MB or smaller.');
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      applyBranding(kind === 'logo' ? await uploadClubLogo(file) : await uploadClubCover(file));
      setStatus(kind === 'logo' ? 'Logo updated.' : 'Cover image updated.');
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusy(false);
    }
  };

  const clearImage = async (kind: 'logo' | 'cover') => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      applyBranding(kind === 'logo' ? await clearClubLogo() : await clearClubCover());
      setStatus(kind === 'logo' ? 'Logo removed.' : 'Cover image removed.');
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusy(false);
    }
  };

  const previewBranding = {
    description: description || null,
    primaryColor: primaryColor || null,
    accentColor: accentColor || null,
    logoUrl: branding?.logoUrl ?? null,
    coverUrl: branding?.coverUrl ?? null,
  };

  return (
    <Card className={`${styles.members} ${styles.brandingCard}`}>
      <div>
        <p>Club branding</p>
        <h2>Identity for {activeWorkspace.name}</h2>
        <span>
          {isCoach
            ? 'Upload a logo and cover image, set a short description, and choose accessible club colours.'
            : 'Only coaches can change club branding. Current branding is shown below.'}
        </span>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {status && <p className={styles.ticket} role="status">{status}</p>}
      {loading ? (
        <p role="status">Loading club branding...</p>
      ) : branding ? (
        <>
          <div className={styles.brandingPreview}>
            <ClubBadge name={activeWorkspace.name} branding={previewBranding} size="lg" />
            <div>
              <strong>{activeWorkspace.name}</strong>
              {description && <p>{description}</p>}
              <div className={styles.swatches} aria-hidden="true">
                <span style={primaryColor && isHexColor(primaryColor) ? { background: primaryColor, color: pickForeground(primaryColor) } : undefined}>Primary</span>
                <span style={accentColor && isHexColor(accentColor) ? { background: accentColor, color: pickForeground(accentColor) } : undefined}>Accent</span>
              </div>
            </div>
            {branding.coverUrl && <img className={styles.coverPreview} src={branding.coverUrl} alt="" />}
          </div>

          {isCoach && (
            <>
              <form className={styles.brandingForm} onSubmit={(event) => void saveDetails(event)}>
                <div className={styles.brandingField}>
                  <label htmlFor="club-description">Description</label>
                  <textarea
                    id="club-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={500}
                    rows={3}
                    disabled={busy}
                    placeholder="What defines your club?"
                  />
                </div>
                <div className={styles.brandingColors}>
                  <div className={styles.brandingField}>
                    <label htmlFor="club-primary-color">Primary colour</label>
                    <input
                      id="club-primary-color"
                      type="color"
                      value={isHexColor(primaryColor) ? primaryColor : '#0092BC'}
                      onChange={(event) => setPrimaryColor(event.target.value.toUpperCase())}
                      disabled={busy}
                    />
                    <code>{primaryColor || 'not set'}</code>
                    {primaryIssue && <small role="alert">{primaryIssue}</small>}
                  </div>
                  <div className={styles.brandingField}>
                    <label htmlFor="club-accent-color">Accent colour</label>
                    <input
                      id="club-accent-color"
                      type="color"
                      value={isHexColor(accentColor) ? accentColor : '#45BED7'}
                      onChange={(event) => setAccentColor(event.target.value.toUpperCase())}
                      disabled={busy}
                    />
                    <code>{accentColor || 'not set'}</code>
                    {accentIssue && <small role="alert">{accentIssue}</small>}
                  </div>
                </div>
                <div className={styles.actions}>
                  <Button type="submit" disabled={!canSave}>{busy ? 'Saving...' : 'Save branding'}</Button>
                </div>
              </form>

              <div className={styles.mediaActions}>
                <div>
                  <strong>Logo</strong>
                  <span>PNG, JPEG, or WebP up to 5 MB.</span>
                  <div className={styles.actions}>
                    <Button variant="secondary" onClick={() => logoInputRef.current?.click()} disabled={busy}>Upload logo</Button>
                    {branding.logoUrl && <Button variant="ghost" onClick={() => void clearImage('logo')} disabled={busy}>Remove</Button>}
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(event) => void handleImage(event, 'logo')}
                  />
                </div>
                <div>
                  <strong>Cover image</strong>
                  <span>PNG, JPEG, or WebP up to 5 MB.</span>
                  <div className={styles.actions}>
                    <Button variant="secondary" onClick={() => coverInputRef.current?.click()} disabled={busy}>Upload cover</Button>
                    {branding.coverUrl && <Button variant="ghost" onClick={() => void clearImage('cover')} disabled={busy}>Remove</Button>}
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(event) => void handleImage(event, 'cover')}
                  />
                </div>
              </div>
            </>
          )}
        </>
      ) : null}
    </Card>
  );
}
