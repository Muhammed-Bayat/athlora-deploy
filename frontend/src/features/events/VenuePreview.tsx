import styles from './EventsPage.module.css';

function osmLink(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=16/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
}

export function VenuePreview({ latitude, longitude, locationName }: { latitude: number | null; longitude: number | null; locationName?: string | null }) {
  const complete = latitude !== null && longitude !== null;
  if (!complete) return <section className={styles.venuePreview} aria-labelledby="venue-preview-heading"><h3 id="venue-preview-heading">Venue map</h3><p>Map preview unavailable until both latitude and longitude are saved. You can still enter the location manually.</p></section>;
  const link = osmLink(latitude, longitude);
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.01}%2C${latitude - 0.006}%2C${longitude + 0.01}%2C${latitude + 0.006}&layer=mapnik&marker=${latitude}%2C${longitude}`;
  return <section className={styles.venuePreview} aria-labelledby="venue-preview-heading">
    <header><div><p>Venue map</p><h3 id="venue-preview-heading">{locationName ?? 'Saved event location'}</h3></div><a href={link} target="_blank" rel="noreferrer">Open in OpenStreetMap <span className={styles.srOnly}>(opens in a new tab)</span></a></header>
    <iframe className={styles.mapFrame} title={`OpenStreetMap preview for ${locationName ?? 'event venue'}`} src={embed} loading="lazy" />
    <p className={styles.coordinates}>Coordinates: {latitude}, {longitude}. Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. If the map cannot load, use the OpenStreetMap link above.</p>
  </section>;
}
