// Approximate representative cities only; timezone is never presented as GPS.
// Unknown/offset-only zones have no inferred location and use the unavailable UI.
const locations: Record<string, readonly [number, number]> = {
  'Africa/Johannesburg': [-26.2041, 28.0473], 'Africa/Maputo': [-25.9667, 32.5833],
  'Africa/Cairo': [30.0444, 31.2357], 'Africa/Lagos': [6.5244, 3.3792],
  'Africa/Nairobi': [-1.2921, 36.8219], 'Africa/Harare': [-17.8252, 31.0335],
  'Europe/London': [51.5074, -0.1278], 'Europe/Paris': [48.8566, 2.3522],
  'Europe/Berlin': [52.52, 13.405], 'Europe/Rome': [41.9028, 12.4964],
  'Europe/Madrid': [40.4168, -3.7038], 'Europe/Amsterdam': [52.3676, 4.9041],
  'America/New_York': [40.7128, -74.006], 'America/Chicago': [41.8781, -87.6298],
  'America/Denver': [39.7392, -104.9903], 'America/Los_Angeles': [34.0522, -118.2437],
  'America/Toronto': [43.6532, -79.3832], 'America/Vancouver': [49.2827, -123.1207],
  'America/Sao_Paulo': [-23.5505, -46.6333], 'America/Mexico_City': [19.4326, -99.1332],
  'Asia/Dubai': [25.2048, 55.2708], 'Asia/Kolkata': [22.5726, 88.3639],
  'Asia/Calcutta': [22.5726, 88.3639], 'Asia/Tokyo': [35.6762, 139.6503],
  'Asia/Shanghai': [31.2304, 121.4737], 'Asia/Singapore': [1.3521, 103.8198],
  'Australia/Sydney': [-33.8688, 151.2093], 'Australia/Melbourne': [-37.8136, 144.9631],
  'Australia/Perth': [-31.9523, 115.8613], 'Pacific/Auckland': [-36.8485, 174.7633],
};
export function timezoneCoordinates(timezone: string): { latitude: number; longitude: number } | null {
  const location = Object.hasOwn(locations, timezone) ? locations[timezone] : null;
  return location ? { latitude: location[0], longitude: location[1] } : null;
}
