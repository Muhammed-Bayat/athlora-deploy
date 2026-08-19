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

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Could not load the event forecast. Please try again.';
}

export function EventWeatherPanel({ event }: { event: AthleticsEvent }) {
  const hasCoordinates = event.latitude !== null && event.longitude !== null;
  const [forecast, setForecast] = useState<EventWeatherForecast | null>(null);
  const [loading, setLoading] = useState(hasCoordinates);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!hasCoordinates) return;
    const controller = new AbortController();
    setLoading(true);
    setForecast(null);
    setError(null);
    setUnavailable(null);
    void getEventWeather(event.id, controller.signal)
      .then(setForecast)
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        const message = unavailableMessage(requestError);
        if (message) setUnavailable(message);
        else setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [event.id, event.date, event.latitude, event.longitude, hasCoordinates, reloadKey]);

  return (
    <section className={styles.weatherPanel} aria-labelledby="event-weather-heading" aria-busy={loading}>
      <header>
        <div><p>Open-Meteo forecast</p><h3 id="event-weather-heading">Event-day weather</h3></div>
        {forecast && <span>{weatherLabel(forecast.weatherCode)}</span>}
      </header>

      {!hasCoordinates && <p className={styles.inlineEmpty}>Add latitude and longitude to view the forecast.</p>}
      {hasCoordinates && loading && <p className={styles.inlineStatus} role="status">Loading event forecast...</p>}
      {!loading && unavailable && <p className={styles.inlineEmpty}>{unavailable}</p>}
      {!loading && error && <div className={styles.inlineError} role="alert"><p>{error}</p><Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>Retry forecast</Button></div>}
      {!loading && forecast && (
        <dl className={styles.weatherMetrics}>
          <div><dt>Temperature</dt><dd>{forecast.temperatureMinC.toFixed(1)}° to {forecast.temperatureMaxC.toFixed(1)}°C</dd></div>
          <div><dt>Rain chance</dt><dd>{forecast.precipitationProbabilityMaxPercent === null ? 'Unavailable' : `${forecast.precipitationProbabilityMaxPercent}%`}</dd></div>
          <div><dt>Max wind</dt><dd>{forecast.windSpeedMaxKmh === null ? 'Unavailable' : `${forecast.windSpeedMaxKmh.toFixed(1)} km/h`}</dd></div>
          <div><dt>Timezone</dt><dd>{forecast.timezone.replaceAll('_', ' ')}</dd></div>
        </dl>
      )}
    </section>
  );
}
