import { useEffect, useState } from 'react';
import { getEventWeather } from '../../api/events';
import { ApiError } from '../../api/client';
import { Button } from '../../components';
import type { AthleticsEvent, EventWeatherForecast } from '../../types';
import { weatherLabel } from '../../utils/weatherConditions';
import styles from './EventsPage.module.css';

function unavailableMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === 'WEATHER_DATE_UNAVAILABLE' || error.code === 'WEATHER_FORECAST_NOT_FOUND') {
    return error.message;
  }
  return null;
}

export function EventWeatherPanel({ event }: { event: AthleticsEvent }) {
  const hasCoordinates = event.latitude !== null && event.longitude !== null;
  const [forecast, setForecast] = useState<EventWeatherForecast | null>(null);
  const [loading, setLoading] = useState(hasCoordinates);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!hasCoordinates) {
      setForecast(null);
      setLoading(false);
      setError(null);
      setUnavailable(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setForecast(null);
    setError(null);
    setUnavailable(null);
    void getEventWeather(event.id, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setForecast(data); })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        const message = unavailableMessage(requestError);
        if (message) setUnavailable(message);
        else setError('Weather temporarily unavailable. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [event.id, event.date, event.latitude, event.longitude, hasCoordinates, reloadKey]);

  return (
    <section className={styles.weatherPanel} aria-labelledby="event-weather-heading" aria-busy={loading}>
      <header>
        <div><p><a href="https://graysky.net" target="_blank" rel="noopener noreferrer">Weather data by GraySky</a></p><h3 id="event-weather-heading">Event-day weather</h3></div>
        {forecast && <span>{weatherLabel(forecast.weatherCode)}</span>}
      </header>

      {!hasCoordinates && <p className={styles.inlineEmpty}>Select a venue when editing this event to view the forecast.</p>}
      {hasCoordinates && loading && <p className={styles.inlineStatus} role="status">Loading event forecast...</p>}
      {!loading && unavailable && <p className={styles.inlineEmpty}>{unavailable}</p>}
      {!loading && error && <div className={styles.inlineError} role="alert"><p>{error}</p><Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>Retry forecast</Button></div>}
      {!loading && forecast && (
        <dl className={styles.weatherMetrics}>
          <div><dt>Temperature</dt><dd>{forecast.temperatureMinC === null ? '—' : `${forecast.temperatureMinC.toFixed(1)}°`} to {forecast.temperatureMaxC === null ? '—' : `${forecast.temperatureMaxC.toFixed(1)}°C`}</dd></div>
          <div><dt>Rain chance</dt><dd>{forecast.precipitationProbabilityMaxPercent === null ? 'Unavailable' : `${forecast.precipitationProbabilityMaxPercent}%`}</dd></div>
          <div><dt>Wind</dt><dd>{forecast.windSpeedKmh === null ? 'Unavailable' : `${forecast.windSpeedKmh.toFixed(1)} km/h`}</dd></div>
          <div><dt>Timezone</dt><dd>{forecast.timezone?.replaceAll('_', ' ') ?? 'Unavailable'}</dd></div>
        </dl>
      )}
    </section>
  );
}
