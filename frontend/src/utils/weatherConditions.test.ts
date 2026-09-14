import { describe, expect, it } from 'vitest';
import { classifyWeather, weatherLabel } from './weatherConditions';
import { timezoneCoordinates } from './weatherLocation';

describe('weather presentation', () => {
  it.each([
    ['clear-day', 'clear'], ['clear-night', 'clear'], ['mostly-clear-night', 'partly'],
    ['partly-cloudy-night', 'partly'], ['mostly-cloudy-day', 'cloudy'], ['cloudy', 'cloudy'],
    ['rain', 'rain'], ['sleet', 'snow'], ['snow', 'snow'], ['fog', 'fog'], ['wind', 'cloudy'],
    ['hail', 'storm'], ['thunderstorm', 'storm'], ['scattered-thunderstorms', 'storm'],
    ['isolated-thunderstorms', 'storm'], ['tornado', 'storm'],
  ])('maps %s to the existing %s visual', (code, visual) => {
    expect(classifyWeather(code)).toBe(visual);
    expect(weatherLabel(code)).not.toBe('Local weather');
  });
  it('uses a safe cloudy fallback for unknown and inherited property names', () => {
    for (const code of ['future-code', 'constructor', '__proto__']) {
      expect(classifyWeather(code)).toBe('cloudy');
      expect(weatherLabel(code)).toBe('Local weather');
    }
    expect(weatherLabel('limited')).toBe('Weather temporarily unavailable');
  });
  it('resolves representative timezone coordinates offline without guessing UTC locations', () => {
    expect(timezoneCoordinates('Africa/Johannesburg')).toEqual({ latitude: -26.2041, longitude: 28.0473 });
    expect(timezoneCoordinates('UTC')).toBeNull();
    expect(timezoneCoordinates('Unknown/City')).toBeNull();
  });
});
