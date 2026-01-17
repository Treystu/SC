/**
 * GeoZone - Geographic zone encoding for privacy-preserving routing
 *
 * Uses a grid-based system to represent locations without exposing
 * exact coordinates. Default 100km grid squares provide:
 * - Useful routing hints for continental message delivery
 * - Privacy protection (millions of people per zone)
 * - Simple zone-to-zone distance calculations
 *
 * Based on Maidenhead Locator System (used by amateur radio)
 * with simplified 100km grid squares.
 */

/**
 * Location precision levels
 */
export enum LocationPrecision {
  /** Exact GPS coordinates (use only for emergency responders) */
  EXACT = 'exact',

  /** 10km grid squares (more precise, less private) */
  GRID_10KM = 'grid_10km',

  /** 100km grid squares (default, good balance) */
  GRID_100KM = 'grid_100km',

  /** Region level (country/state, maximum privacy) */
  REGION = 'region',

  /** No location information */
  NONE = 'none',
}

/**
 * A geographic zone at specified precision
 */
export interface GeoZone {
  /** Zone identifier (e.g., "FN31" for NYC area) */
  zoneId: string;

  /** Center latitude of zone */
  centerLat: number;

  /** Center longitude of zone */
  centerLon: number;

  /** Precision level */
  precision: LocationPrecision;

  /** Human-readable description */
  description?: string;

  /** Country code (ISO 3166-1 alpha-2) */
  countryCode?: string;

  /** Region/state code */
  regionCode?: string;
}

/**
 * Maidenhead grid square (used for zone encoding)
 */
interface MaidenheadSquare {
  /** Field (18 worldwide: A-R for longitude, A-R for latitude) */
  field: string;

  /** Square (100 per field: 0-9 for longitude, 0-9 for latitude) */
  square: string;

  /** Subsquare (576 per square: a-x for longitude, a-x for latitude) */
  subsquare?: string;
}

/**
 * Encode latitude/longitude to Maidenhead grid locator
 */
export function latLonToMaidenhead(lat: number, lon: number, precision: 4 | 6 = 4): string {
  // Normalize coordinates
  lon = lon + 180;
  lat = lat + 90;

  // Field (first 2 chars)
  const fieldLon = Math.floor(lon / 20);
  const fieldLat = Math.floor(lat / 10);
  const field = String.fromCharCode(65 + fieldLon) + String.fromCharCode(65 + fieldLat);

  // Square (chars 3-4)
  const squareLon = Math.floor((lon % 20) / 2);
  const squareLat = Math.floor(lat % 10);
  const square = squareLon.toString() + squareLat.toString();

  if (precision === 4) {
    return field + square;
  }

  // Subsquare (chars 5-6)
  const subLon = Math.floor((lon % 2) * 12);
  const subLat = Math.floor((lat % 1) * 24);
  const subsquare = String.fromCharCode(97 + subLon) + String.fromCharCode(97 + subLat);

  return field + square + subsquare;
}

/**
 * Decode Maidenhead grid locator to latitude/longitude (center of square)
 */
export function maidenheadToLatLon(locator: string): { lat: number; lon: number } {
  const upper = locator.toUpperCase();

  // Field
  const fieldLon = upper.charCodeAt(0) - 65;
  const fieldLat = upper.charCodeAt(1) - 65;

  let lon = fieldLon * 20 - 180;
  let lat = fieldLat * 10 - 90;

  // Square
  if (locator.length >= 4) {
    const squareLon = parseInt(upper[2], 10);
    const squareLat = parseInt(upper[3], 10);
    lon += squareLon * 2;
    lat += squareLat;
  }

  // Subsquare
  if (locator.length >= 6) {
    const subLon = upper.charCodeAt(4) - 65;
    const subLat = upper.charCodeAt(5) - 65;
    lon += subLon / 12;
    lat += subLat / 24;
  }

  // Return center of square
  if (locator.length === 4) {
    lon += 1; // Center of 2-degree square
    lat += 0.5; // Center of 1-degree square
  } else if (locator.length === 6) {
    lon += 1 / 24;
    lat += 1 / 48;
  }

  return { lat, lon };
}

/**
 * Encode a location to GeoZone at specified precision
 */
export function encodeGeoZone(
  lat: number,
  lon: number,
  precision: LocationPrecision = LocationPrecision.GRID_100KM
): GeoZone {
  switch (precision) {
    case LocationPrecision.EXACT:
      return {
        zoneId: `${lat.toFixed(6)},${lon.toFixed(6)}`,
        centerLat: lat,
        centerLon: lon,
        precision,
      };

    case LocationPrecision.GRID_10KM:
      // 6-character Maidenhead (approximately 10km)
      const locator6 = latLonToMaidenhead(lat, lon, 6);
      const center6 = maidenheadToLatLon(locator6);
      return {
        zoneId: locator6,
        centerLat: center6.lat,
        centerLon: center6.lon,
        precision,
      };

    case LocationPrecision.GRID_100KM:
      // 4-character Maidenhead (approximately 100km)
      const locator4 = latLonToMaidenhead(lat, lon, 4);
      const center4 = maidenheadToLatLon(locator4);
      return {
        zoneId: locator4,
        centerLat: center4.lat,
        centerLon: center4.lon,
        precision,
      };

    case LocationPrecision.REGION:
      // Just the field (approximately 1000km x 2000km)
      const locator2 = latLonToMaidenhead(lat, lon, 4).substring(0, 2);
      const center2 = maidenheadToLatLon(locator2 + '44'); // Center of field
      return {
        zoneId: locator2,
        centerLat: center2.lat,
        centerLon: center2.lon,
        precision,
      };

    case LocationPrecision.NONE:
    default:
      return {
        zoneId: 'UNKNOWN',
        centerLat: 0,
        centerLon: 0,
        precision: LocationPrecision.NONE,
      };
  }
}

/**
 * Calculate distance between two zones in kilometers
 * Uses Haversine formula for accuracy
 */
export function geoDistance(zone1: GeoZone, zone2: GeoZone): number {
  if (zone1.precision === LocationPrecision.NONE ||
      zone2.precision === LocationPrecision.NONE) {
    return Infinity;
  }

  const R = 6371; // Earth's radius in km

  const lat1 = zone1.centerLat * Math.PI / 180;
  const lat2 = zone2.centerLat * Math.PI / 180;
  const dLat = (zone2.centerLat - zone1.centerLat) * Math.PI / 180;
  const dLon = (zone2.centerLon - zone1.centerLon) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Get adjacent zones (for routing)
 */
export function getAdjacentZones(zone: GeoZone): GeoZone[] {
  if (zone.precision !== LocationPrecision.GRID_100KM) {
    return []; // Only support for 100km grid
  }

  const locator = zone.zoneId;
  if (locator.length !== 4) return [];

  const fieldLon = locator.charCodeAt(0) - 65;
  const fieldLat = locator.charCodeAt(1) - 65;
  const squareLon = parseInt(locator[2], 10);
  const squareLat = parseInt(locator[3], 10);

  const adjacent: GeoZone[] = [];

  // 8 adjacent squares
  for (let dLon = -1; dLon <= 1; dLon++) {
    for (let dLat = -1; dLat <= 1; dLat++) {
      if (dLon === 0 && dLat === 0) continue;

      let newSquareLon = squareLon + dLon;
      let newSquareLat = squareLat + dLat;
      let newFieldLon = fieldLon;
      let newFieldLat = fieldLat;

      // Handle square overflow
      if (newSquareLon < 0) {
        newSquareLon = 9;
        newFieldLon--;
      } else if (newSquareLon > 9) {
        newSquareLon = 0;
        newFieldLon++;
      }

      if (newSquareLat < 0) {
        newSquareLat = 9;
        newFieldLat--;
      } else if (newSquareLat > 9) {
        newSquareLat = 0;
        newFieldLat++;
      }

      // Check field bounds
      if (newFieldLon < 0 || newFieldLon > 17) continue;
      if (newFieldLat < 0 || newFieldLat > 17) continue;

      const newLocator =
        String.fromCharCode(65 + newFieldLon) +
        String.fromCharCode(65 + newFieldLat) +
        newSquareLon.toString() +
        newSquareLat.toString();

      const center = maidenheadToLatLon(newLocator);
      adjacent.push({
        zoneId: newLocator,
        centerLat: center.lat,
        centerLon: center.lon,
        precision: LocationPrecision.GRID_100KM,
      });
    }
  }

  return adjacent;
}

/**
 * Check if a zone is on the path between two other zones
 * Useful for preferring relay nodes in the right direction
 */
export function isOnPath(
  zone: GeoZone,
  from: GeoZone,
  to: GeoZone,
  toleranceKm: number = 200
): boolean {
  const fromToDist = geoDistance(from, to);
  const fromZoneDist = geoDistance(from, zone);
  const zoneToToDist = geoDistance(zone, to);

  // Zone is on path if from->zone->to is not much longer than from->to
  const detour = (fromZoneDist + zoneToToDist) - fromToDist;

  return detour <= toleranceKm;
}

/**
 * Get cardinal direction from one zone to another
 */
export function getDirection(from: GeoZone, to: GeoZone): string {
  const dLat = to.centerLat - from.centerLat;
  const dLon = to.centerLon - from.centerLon;

  const angle = Math.atan2(dLon, dLat) * 180 / Math.PI;

  // Convert angle to cardinal direction
  if (angle >= -22.5 && angle < 22.5) return 'N';
  if (angle >= 22.5 && angle < 67.5) return 'NE';
  if (angle >= 67.5 && angle < 112.5) return 'E';
  if (angle >= 112.5 && angle < 157.5) return 'SE';
  if (angle >= 157.5 || angle < -157.5) return 'S';
  if (angle >= -157.5 && angle < -112.5) return 'SW';
  if (angle >= -112.5 && angle < -67.5) return 'W';
  return 'NW';
}

/**
 * Well-known zones for testing
 */
export const KNOWN_ZONES = {
  NYC: encodeGeoZone(40.7128, -74.0060, LocationPrecision.GRID_100KM),
  LA: encodeGeoZone(34.0522, -118.2437, LocationPrecision.GRID_100KM),
  CHICAGO: encodeGeoZone(41.8781, -87.6298, LocationPrecision.GRID_100KM),
  LONDON: encodeGeoZone(51.5074, -0.1278, LocationPrecision.GRID_100KM),
  TOKYO: encodeGeoZone(35.6762, 139.6503, LocationPrecision.GRID_100KM),
  SYDNEY: encodeGeoZone(-33.8688, 151.2093, LocationPrecision.GRID_100KM),
};
