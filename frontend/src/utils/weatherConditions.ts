export type WeatherAtmosphere = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

const conditions: Record<string, [string, WeatherAtmosphere]> = {
  'clear-day': ['Clear', 'clear'], 'clear-night': ['Clear', 'clear'],
  'mostly-clear-day': ['Mostly clear', 'partly'], 'mostly-clear-night': ['Mostly clear', 'partly'],
  'partly-cloudy-day': ['Partly cloudy', 'partly'], 'partly-cloudy-night': ['Partly cloudy', 'partly'],
  'mostly-cloudy-day': ['Mostly cloudy', 'cloudy'], 'mostly-cloudy-night': ['Mostly cloudy', 'cloudy'],
  cloudy: ['Overcast', 'cloudy'], rain: ['Rain', 'rain'], sleet: ['Sleet', 'snow'], snow: ['Snow', 'snow'],
  wind: ['Windy', 'cloudy'], fog: ['Fog', 'fog'], hail: ['Hail', 'storm'],
  thunderstorm: ['Thunderstorm', 'storm'], 'scattered-thunderstorms': ['Scattered thunderstorms', 'storm'],
  'isolated-thunderstorms': ['Isolated thunderstorms', 'storm'], tornado: ['Tornado', 'storm'],
  limited: ['Weather temporarily unavailable', 'cloudy'],
};
export function weatherLabel(code: string): string { return Object.hasOwn(conditions, code) ? conditions[code][0] : 'Local weather'; }
export function classifyWeather(code: string): WeatherAtmosphere { return Object.hasOwn(conditions, code) ? conditions[code][1] : 'cloudy'; }
