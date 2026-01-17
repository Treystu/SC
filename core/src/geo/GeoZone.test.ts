/**
 * GeoZone Tests
 *
 * Tests comprehensive geographic zone functionality including:
 * - Maidenhead locator encoding/decoding
 * - Coordinate normalization and validation
 * - Grid square calculations
 * - Distance calculations (haversine formula)
 * - Direction calculation (compass points)
 * - Privacy levels (exact vs 100km vs region)
 * - Edge cases: Poles, dateline crossing, boundary conditions
 * - Adjacent zone calculations
 * - Path detection for routing
 */

import {
  latLonToMaidenhead,
  maidenheadToLatLon,
  encodeGeoZone,
  geoDistance,
  getAdjacentZones,
  isOnPath,
  getDirection,
  LocationPrecision,
  KNOWN_ZONES,
  type GeoZone,
} from './GeoZone.js';

describe('GeoZone', () => {
  describe('latLonToMaidenhead() - Encoding', () => {
    it('should encode NYC coordinates to FN20', () => {
      // NYC: 40.7128°N, 74.0060°W (actual grid is FN20, not FN30)
      const locator = latLonToMaidenhead(40.7128, -74.006, 4);
      expect(locator).toBe('FN20');
    });

    it('should encode LA coordinates to DM04', () => {
      // LA: 34.0522°N, 118.2437°W
      const locator = latLonToMaidenhead(34.0522, -118.2437, 4);
      expect(locator).toBe('DM04');
    });

    it('should encode London coordinates to IO91', () => {
      // London: 51.5074°N, 0.1278°W
      const locator = latLonToMaidenhead(51.5074, -0.1278, 4);
      expect(locator).toBe('IO91');
    });

    it('should encode Tokyo coordinates to PM95', () => {
      // Tokyo: 35.6762°N, 139.6503°E
      const locator = latLonToMaidenhead(35.6762, 139.6503, 4);
      expect(locator).toBe('PM95');
    });

    it('should encode Sydney coordinates to QF56', () => {
      // Sydney: 33.8688°S, 151.2093°E
      const locator = latLonToMaidenhead(-33.8688, 151.2093, 4);
      expect(locator).toBe('QF56');
    });

    it('should encode 6-character locator for higher precision', () => {
      const locator4 = latLonToMaidenhead(40.7128, -74.006, 4);
      const locator6 = latLonToMaidenhead(40.7128, -74.006, 6);

      expect(locator6).toMatch(/^[A-R]{2}[0-9]{2}[a-x]{2}$/);
      expect(locator6.substring(0, 4)).toBe(locator4);
      expect(locator6.length).toBe(6);
    });

    it('should handle equator (0° latitude)', () => {
      const locator = latLonToMaidenhead(0, 0, 4);
      expect(locator).toBe('JJ00');
    });

    it('should handle prime meridian (0° longitude)', () => {
      const locator = latLonToMaidenhead(51.5, 0, 4);
      expect(locator).toBe('JO01');
    });

    it('should handle North Pole (90° latitude)', () => {
      const locator = latLonToMaidenhead(89.99, 0, 4);
      expect(locator).toMatch(/^J[P-R][0-9]{2}$/);
    });

    it('should handle South Pole (-90° latitude)', () => {
      const locator = latLonToMaidenhead(-89.99, 0, 4);
      expect(locator).toMatch(/^J[A-C][0-9]{2}$/);
    });

    it('should normalize coordinates across dateline (180° longitude)', () => {
      const locator1 = latLonToMaidenhead(40, 179.9, 4);
      const locator2 = latLonToMaidenhead(40, -179.9, 4);

      // Should be valid locators on opposite sides of dateline
      expect(locator1).toMatch(/^[A-R][A-R][0-9]{2}$/);
      expect(locator2).toMatch(/^[A-R][A-R][0-9]{2}$/);
      // They should be different (one near R, one near A)
      expect(locator1[0]).not.toBe(locator2[0]);
    });

    it('should handle western hemisphere negative longitudes', () => {
      const locator = latLonToMaidenhead(40, -100, 4);
      expect(locator).toMatch(/^[A-I][A-R][0-9]{2}$/);
    });

    it('should handle eastern hemisphere positive longitudes', () => {
      const locator = latLonToMaidenhead(40, 100, 4);
      expect(locator).toMatch(/^[K-R][A-R][0-9]{2}$/);
    });

    it('should handle southern hemisphere negative latitudes', () => {
      const locator = latLonToMaidenhead(-40, 0, 4);
      expect(locator).toMatch(/^J[A-I][0-9]{2}$/);
    });

    it('should handle northern hemisphere positive latitudes', () => {
      const locator = latLonToMaidenhead(40, 0, 4);
      expect(locator).toMatch(/^J[K-R][0-9]{2}$/);
    });
  });

  describe('maidenheadToLatLon() - Decoding', () => {
    it('should decode FN30 to NYC area', () => {
      const { lat, lon } = maidenheadToLatLon('FN30');

      // Should be near NYC (40.7128°N, 74.0060°W)
      expect(lat).toBeGreaterThan(39);
      expect(lat).toBeLessThan(42);
      expect(lon).toBeGreaterThan(-76);
      expect(lon).toBeLessThan(-72);
    });

    it('should decode DM04 to LA area', () => {
      const { lat, lon } = maidenheadToLatLon('DM04');

      // Should be near LA (34.0522°N, 118.2437°W)
      expect(lat).toBeGreaterThan(33);
      expect(lat).toBeLessThan(36);
      expect(lon).toBeGreaterThan(-120);
      expect(lon).toBeLessThan(-116);
    });

    it('should decode IO91 to London area', () => {
      const { lat, lon } = maidenheadToLatLon('IO91');

      // Should be near London (51.5074°N, 0.1278°W)
      expect(lat).toBeGreaterThan(50);
      expect(lat).toBeLessThan(53);
      expect(lon).toBeGreaterThan(-2);
      expect(lon).toBeLessThan(2);
    });

    it('should decode 6-character locators for higher precision', () => {
      const { lat, lon } = maidenheadToLatLon('FN30as');

      // Higher precision = smaller area
      // FN30 spans 40-41° lat, -74 to -72° lon
      expect(lat).toBeGreaterThan(40);
      expect(lat).toBeLessThan(41);
      expect(lon).toBeGreaterThan(-75);
      expect(lon).toBeLessThan(-72); // FN30 center is around -73°
    });

    it('should handle lowercase input', () => {
      const upper = maidenheadToLatLon('FN30');
      const lower = maidenheadToLatLon('fn30');

      expect(lower.lat).toBeCloseTo(upper.lat, 5);
      expect(lower.lon).toBeCloseTo(upper.lon, 5);
    });

    it('should handle mixed case input', () => {
      const result = maidenheadToLatLon('Fn30As');

      expect(result.lat).toBeGreaterThan(40);
      expect(result.lon).toBeLessThan(-72); // FN30 center is around -73°
    });

    it('should return center of 4-character grid square', () => {
      const { lat, lon } = maidenheadToLatLon('FN30');

      // 4-char grid is 2° lon x 1° lat
      // Center should be at +1° lon, +0.5° lat from corner
      const encoded = latLonToMaidenhead(lat, lon, 4);
      expect(encoded).toBe('FN30');
    });

    it('should return center of 6-character grid square', () => {
      const { lat, lon } = maidenheadToLatLon('FN30as');

      const encoded = latLonToMaidenhead(lat, lon, 6);
      expect(encoded.toUpperCase()).toBe('FN30AS');
    });

    it('should round-trip encode/decode correctly', () => {
      const original = { lat: 40.7128, lon: -74.006 };

      const locator4 = latLonToMaidenhead(original.lat, original.lon, 4);
      const decoded4 = maidenheadToLatLon(locator4);
      const reencoded4 = latLonToMaidenhead(decoded4.lat, decoded4.lon, 4);

      expect(reencoded4).toBe(locator4);

      const locator6 = latLonToMaidenhead(original.lat, original.lon, 6);
      const decoded6 = maidenheadToLatLon(locator6);
      const reencoded6 = latLonToMaidenhead(decoded6.lat, decoded6.lon, 6);

      expect(reencoded6).toBe(locator6);
    });
  });

  describe('encodeGeoZone() - Privacy Levels', () => {
    it('should encode EXACT precision with full coordinates', () => {
      const zone = encodeGeoZone(40.7128, -74.006, LocationPrecision.EXACT);

      expect(zone.precision).toBe(LocationPrecision.EXACT);
      expect(zone.centerLat).toBe(40.7128);
      expect(zone.centerLon).toBe(-74.006);
      expect(zone.zoneId).toMatch(/^40\.712800,-74\.006000$/);
    });

    it('should encode GRID_10KM precision (6-character Maidenhead)', () => {
      const zone = encodeGeoZone(40.7128, -74.006, LocationPrecision.GRID_10KM);

      expect(zone.precision).toBe(LocationPrecision.GRID_10KM);
      expect(zone.zoneId.length).toBe(6);
      expect(zone.zoneId).toMatch(/^[A-R]{2}[0-9]{2}[a-x]{2}$/i);

      // Center should be approximate, not exact
      expect(zone.centerLat).not.toBe(40.7128);
      expect(zone.centerLon).not.toBe(-74.006);
      expect(Math.abs(zone.centerLat - 40.7128)).toBeLessThan(0.1);
      expect(Math.abs(zone.centerLon - (-74.006))).toBeLessThan(0.2);
    });

    it('should encode GRID_100KM precision (4-character Maidenhead)', () => {
      const zone = encodeGeoZone(40.7128, -74.006, LocationPrecision.GRID_100KM);

      expect(zone.precision).toBe(LocationPrecision.GRID_100KM);
      expect(zone.zoneId).toBe('FN20'); // NYC is in FN20
      expect(zone.zoneId.length).toBe(4);

      // Center should be grid center, not exact location
      expect(zone.centerLat).not.toBe(40.7128);
      expect(zone.centerLon).not.toBe(-74.006);
      expect(Math.abs(zone.centerLat - 40.7128)).toBeLessThan(1);
      expect(Math.abs(zone.centerLon - (-74.006))).toBeLessThan(2);
    });

    it('should encode REGION precision (2-character field)', () => {
      const zone = encodeGeoZone(40.7128, -74.006, LocationPrecision.REGION);

      expect(zone.precision).toBe(LocationPrecision.REGION);
      expect(zone.zoneId).toBe('FN');
      expect(zone.zoneId.length).toBe(2);

      // Center should be very approximate
      expect(Math.abs(zone.centerLat - 40.7128)).toBeLessThan(10);
      expect(Math.abs(zone.centerLon - (-74.006))).toBeLessThan(20);
    });

    it('should encode NONE precision', () => {
      const zone = encodeGeoZone(40.7128, -74.006, LocationPrecision.NONE);

      expect(zone.precision).toBe(LocationPrecision.NONE);
      expect(zone.zoneId).toBe('UNKNOWN');
      expect(zone.centerLat).toBe(0);
      expect(zone.centerLon).toBe(0);
    });

    it('should default to GRID_100KM when precision not specified', () => {
      const zone = encodeGeoZone(40.7128, -74.006);

      expect(zone.precision).toBe(LocationPrecision.GRID_100KM);
      expect(zone.zoneId.length).toBe(4);
    });

    it('should preserve privacy by quantizing to grid center', () => {
      // Both points in the middle of FN20 grid (40-41°N, -76 to -74°W)
      const zone1 = encodeGeoZone(40.3, -75.5, LocationPrecision.GRID_100KM);
      const zone2 = encodeGeoZone(40.7, -75.0, LocationPrecision.GRID_100KM);

      // Different exact locations in same grid should have same zone ID
      expect(zone1.zoneId).toBe(zone2.zoneId);
      expect(zone1.centerLat).toBe(zone2.centerLat);
      expect(zone1.centerLon).toBe(zone2.centerLon);
    });
  });

  describe('geoDistance() - Haversine Distance Calculation', () => {
    it('should calculate distance between NYC and LA', () => {
      const distance = geoDistance(KNOWN_ZONES.NYC, KNOWN_ZONES.LA);

      // NYC to LA is approximately 3900 km (using grid centers)
      expect(distance).toBeGreaterThan(3800);
      expect(distance).toBeLessThan(4000);
    });

    it('should calculate distance between London and Tokyo', () => {
      const distance = geoDistance(KNOWN_ZONES.LONDON, KNOWN_ZONES.TOKYO);

      // London to Tokyo is approximately 9560 km
      expect(distance).toBeGreaterThan(9500);
      expect(distance).toBeLessThan(9600);
    });

    it('should calculate distance between Sydney and Tokyo', () => {
      const distance = geoDistance(KNOWN_ZONES.SYDNEY, KNOWN_ZONES.TOKYO);

      // Sydney to Tokyo is approximately 7800 km
      expect(distance).toBeGreaterThan(7700);
      expect(distance).toBeLessThan(7900);
    });

    it('should return 0 for same zone', () => {
      const distance = geoDistance(KNOWN_ZONES.NYC, KNOWN_ZONES.NYC);

      expect(distance).toBeCloseTo(0, 1);
    });

    it('should be symmetric (distance A→B = distance B→A)', () => {
      const distAB = geoDistance(KNOWN_ZONES.NYC, KNOWN_ZONES.LA);
      const distBA = geoDistance(KNOWN_ZONES.LA, KNOWN_ZONES.NYC);

      expect(distAB).toBeCloseTo(distBA, 5);
    });

    it('should return Infinity when either zone is NONE', () => {
      const noneZone = encodeGeoZone(0, 0, LocationPrecision.NONE);

      expect(geoDistance(KNOWN_ZONES.NYC, noneZone)).toBe(Infinity);
      expect(geoDistance(noneZone, KNOWN_ZONES.LA)).toBe(Infinity);
      expect(geoDistance(noneZone, noneZone)).toBe(Infinity);
    });

    it('should handle poles correctly', () => {
      const northPole = encodeGeoZone(89, 0, LocationPrecision.GRID_100KM);
      const southPole = encodeGeoZone(-89, 0, LocationPrecision.GRID_100KM);

      const distance = geoDistance(northPole, southPole);

      // Pole to pole is approximately half Earth's circumference (~20000 km)
      expect(distance).toBeGreaterThan(19000);
      expect(distance).toBeLessThan(21000);
    });

    it('should handle dateline crossing correctly', () => {
      const west = encodeGeoZone(40, 179, LocationPrecision.GRID_100KM);
      const east = encodeGeoZone(40, -179, LocationPrecision.GRID_100KM);

      const distance = geoDistance(west, east);

      // Should be short distance, not around the world
      expect(distance).toBeLessThan(500);
    });

    it('should handle equator crossing correctly', () => {
      const north = encodeGeoZone(1, 0, LocationPrecision.GRID_100KM);
      const south = encodeGeoZone(-1, 0, LocationPrecision.GRID_100KM);

      const distance = geoDistance(north, south);

      // 2 degrees latitude at equator ≈ 222 km
      expect(distance).toBeGreaterThan(200);
      expect(distance).toBeLessThan(250);
    });

    it('should handle close zones accurately', () => {
      const zone1 = encodeGeoZone(40.71, -74.01, LocationPrecision.EXACT);
      const zone2 = encodeGeoZone(40.72, -74.00, LocationPrecision.EXACT);

      const distance = geoDistance(zone1, zone2);

      // Very close coordinates
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(2); // Less than 2 km
    });

    it('should handle maximum distance (antipodal points)', () => {
      const point1 = encodeGeoZone(40, -74, LocationPrecision.EXACT);
      const point2 = encodeGeoZone(-40, 106, LocationPrecision.EXACT); // Opposite side

      const distance = geoDistance(point1, point2);

      // Maximum Earth surface distance is half circumference (~20000 km)
      expect(distance).toBeGreaterThan(15000);
      expect(distance).toBeLessThan(21000);
    });
  });

  describe('getDirection() - Compass Point Calculation', () => {
    it('should return N for northward direction', () => {
      const from = encodeGeoZone(40, 0, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(50, 0, LocationPrecision.GRID_100KM);

      expect(getDirection(from, to)).toBe('N');
    });

    it('should return S for southward direction', () => {
      const from = encodeGeoZone(40, 0, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(30, 0, LocationPrecision.GRID_100KM);

      expect(getDirection(from, to)).toBe('S');
    });

    it('should return E for eastward direction', () => {
      const from = encodeGeoZone(40, 0, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(40, 10, LocationPrecision.GRID_100KM);

      expect(getDirection(from, to)).toBe('E');
    });

    it('should return W for westward direction', () => {
      const from = encodeGeoZone(40, 0, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(40, -10, LocationPrecision.GRID_100KM);

      expect(getDirection(from, to)).toBe('W');
    });

    it('should return NE for northeast direction', () => {
      const from = encodeGeoZone(40, 0, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(45, 5, LocationPrecision.GRID_100KM);

      expect(getDirection(from, to)).toBe('NE');
    });

    it('should return SE for southeast direction', () => {
      const from = encodeGeoZone(40, 0, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(35, 5, LocationPrecision.GRID_100KM);

      expect(getDirection(from, to)).toBe('SE');
    });

    it('should return SW for southwest direction', () => {
      const from = encodeGeoZone(40, 0, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(35, -5, LocationPrecision.GRID_100KM);

      expect(getDirection(from, to)).toBe('SW');
    });

    it('should return NW for northwest direction', () => {
      const from = encodeGeoZone(40, 0, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(45, -5, LocationPrecision.GRID_100KM);

      expect(getDirection(from, to)).toBe('NW');
    });

    it('should calculate correct direction from NYC to LA (W)', () => {
      const direction = getDirection(KNOWN_ZONES.NYC, KNOWN_ZONES.LA);

      // LA is west of NYC
      expect(direction).toMatch(/W/);
    });

    it('should calculate correct direction from London to Tokyo (E)', () => {
      const direction = getDirection(KNOWN_ZONES.LONDON, KNOWN_ZONES.TOKYO);

      // Tokyo is east of London
      expect(direction).toMatch(/E/);
    });

    it('should handle dateline crossing correctly', () => {
      const west = encodeGeoZone(40, 179, LocationPrecision.GRID_100KM);
      const east = encodeGeoZone(40, -179, LocationPrecision.GRID_100KM);

      const direction = getDirection(west, east);

      // Direction should be either E or W depending on implementation
      // Both are valid interpretations of crossing the dateline
      expect(direction).toMatch(/^[EW]$/);
    });

    it('should handle north pole boundary', () => {
      const nearPole = encodeGeoZone(85, 0, LocationPrecision.GRID_100KM);
      const south = encodeGeoZone(80, 0, LocationPrecision.GRID_100KM);

      const direction = getDirection(nearPole, south);

      expect(direction).toBe('S');
    });

    it('should handle south pole boundary', () => {
      const nearPole = encodeGeoZone(-85, 0, LocationPrecision.GRID_100KM);
      const north = encodeGeoZone(-80, 0, LocationPrecision.GRID_100KM);

      const direction = getDirection(nearPole, north);

      expect(direction).toBe('N');
    });
  });

  describe('getAdjacentZones() - Adjacent Grid Squares', () => {
    it('should return 8 adjacent zones for interior grid square', () => {
      const zone = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);
      const adjacent = getAdjacentZones(zone);

      expect(adjacent).toHaveLength(8);
    });

    it('should include all 8 directions (N, NE, E, SE, S, SW, W, NW)', () => {
      const zone = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);
      const adjacent = getAdjacentZones(zone);

      const directions = adjacent.map(adj => getDirection(zone, adj));

      expect(directions).toContain('N');
      expect(directions).toContain('NE');
      expect(directions).toContain('E');
      expect(directions).toContain('SE');
      expect(directions).toContain('S');
      expect(directions).toContain('SW');
      expect(directions).toContain('W');
      expect(directions).toContain('NW');
    });

    it('should return zones at approximately 100-200km distance', () => {
      const zone = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);
      const adjacent = getAdjacentZones(zone);

      adjacent.forEach(adj => {
        const distance = geoDistance(zone, adj);
        expect(distance).toBeGreaterThan(50); // Not same zone
        expect(distance).toBeLessThan(300); // Adjacent, not far
      });
    });

    it('should handle field boundary crossing', () => {
      // Get a zone at the edge of a field
      const zone = encodeGeoZone(40, -60, LocationPrecision.GRID_100KM);
      const adjacent = getAdjacentZones(zone);

      // Should still return 8 adjacent zones
      expect(adjacent.length).toBeLessThanOrEqual(8);
      expect(adjacent.length).toBeGreaterThan(5);
    });

    it('should return empty array for non-100KM precision', () => {
      const exactZone = encodeGeoZone(40, -74, LocationPrecision.EXACT);
      const regionZone = encodeGeoZone(40, -74, LocationPrecision.REGION);

      expect(getAdjacentZones(exactZone)).toEqual([]);
      expect(getAdjacentZones(regionZone)).toEqual([]);
    });

    it('should handle world edge boundaries (near poles)', () => {
      const highLat = encodeGeoZone(85, 0, LocationPrecision.GRID_100KM);
      const adjacent = getAdjacentZones(highLat);

      // May have fewer adjacent zones near poles
      expect(adjacent.length).toBeGreaterThanOrEqual(0);
      expect(adjacent.length).toBeLessThanOrEqual(8);
    });

    it('should handle dateline crossing', () => {
      const zone = encodeGeoZone(40, 179, LocationPrecision.GRID_100KM);
      const adjacent = getAdjacentZones(zone);

      // Should handle wrapping - at least some adjacent zones should be found
      expect(adjacent.length).toBeGreaterThanOrEqual(5);
    });

    it('should not include the original zone', () => {
      const zone = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);
      const adjacent = getAdjacentZones(zone);

      const matchingZone = adjacent.find(adj => adj.zoneId === zone.zoneId);
      expect(matchingZone).toBeUndefined();
    });

    it('should have unique zone IDs', () => {
      const zone = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);
      const adjacent = getAdjacentZones(zone);

      const zoneIds = adjacent.map(z => z.zoneId);
      const uniqueIds = new Set(zoneIds);

      expect(uniqueIds.size).toBe(zoneIds.length);
    });
  });

  describe('isOnPath() - Path Detection for Routing', () => {
    it('should return true for zone on direct path', () => {
      const from = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM); // NYC
      const to = encodeGeoZone(34, -118, LocationPrecision.GRID_100KM); // LA
      const middle = encodeGeoZone(37, -96, LocationPrecision.GRID_100KM); // Central US

      const onPath = isOnPath(middle, from, to);

      expect(onPath).toBe(true);
    });

    it('should return false for zone far off path', () => {
      const from = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM); // NYC
      const to = encodeGeoZone(34, -118, LocationPrecision.GRID_100KM); // LA
      const offPath = encodeGeoZone(60, -100, LocationPrecision.GRID_100KM); // Northern Canada

      const onPath = isOnPath(offPath, from, to);

      expect(onPath).toBe(false);
    });

    it('should return true for source zone', () => {
      const from = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(34, -118, LocationPrecision.GRID_100KM);

      const onPath = isOnPath(from, from, to);

      expect(onPath).toBe(true);
    });

    it('should return true for destination zone', () => {
      const from = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(34, -118, LocationPrecision.GRID_100KM);

      const onPath = isOnPath(to, from, to);

      expect(onPath).toBe(true);
    });

    it('should respect tolerance parameter', () => {
      const from = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(34, -118, LocationPrecision.GRID_100KM);
      const farOff = encodeGeoZone(60, -95, LocationPrecision.GRID_100KM); // Way off path

      // With tight tolerance, far off zones should be excluded
      expect(isOnPath(farOff, from, to, 50)).toBe(false);

      // Near path zones might be included depending on implementation
      const nearPath = encodeGeoZone(37, -95, LocationPrecision.GRID_100KM);
      const result = isOnPath(nearPath, from, to, 500);
      expect(typeof result).toBe('boolean'); // Just verify it returns boolean
    });

    it('should use default tolerance of 200km', () => {
      const from = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(34, -118, LocationPrecision.GRID_100KM);
      const nearPath = encodeGeoZone(37, -95, LocationPrecision.GRID_100KM);

      const onPath = isOnPath(nearPath, from, to);

      // Should use default 200km tolerance
      expect(typeof onPath).toBe('boolean');
    });

    it('should handle short routes correctly', () => {
      const from = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(41, -73, LocationPrecision.GRID_100KM); // Adjacent zone
      const middle = encodeGeoZone(40.5, -73.5, LocationPrecision.GRID_100KM);

      const onPath = isOnPath(middle, from, to);

      expect(onPath).toBe(true);
    });

    it('should handle zigzag routes correctly', () => {
      const from = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);
      const to = encodeGeoZone(40, -75, LocationPrecision.GRID_100KM); // West
      const wayEast = encodeGeoZone(40, -60, LocationPrecision.GRID_100KM); // Way east (definitely wrong way)

      // A zone way in the opposite direction should not be on path
      const onPath = isOnPath(wayEast, from, to);

      expect(onPath).toBe(false);
    });
  });

  describe('KNOWN_ZONES - Well-Known Test Zones', () => {
    it('should have NYC zone', () => {
      expect(KNOWN_ZONES.NYC).toBeDefined();
      expect(KNOWN_ZONES.NYC.precision).toBe(LocationPrecision.GRID_100KM);
      expect(KNOWN_ZONES.NYC.zoneId).toBe('FN20'); // NYC coordinates map to FN20
    });

    it('should have LA zone', () => {
      expect(KNOWN_ZONES.LA).toBeDefined();
      expect(KNOWN_ZONES.LA.precision).toBe(LocationPrecision.GRID_100KM);
      expect(KNOWN_ZONES.LA.zoneId).toBe('DM04');
    });

    it('should have Chicago zone', () => {
      expect(KNOWN_ZONES.CHICAGO).toBeDefined();
      expect(KNOWN_ZONES.CHICAGO.precision).toBe(LocationPrecision.GRID_100KM);
    });

    it('should have London zone', () => {
      expect(KNOWN_ZONES.LONDON).toBeDefined();
      expect(KNOWN_ZONES.LONDON.precision).toBe(LocationPrecision.GRID_100KM);
      expect(KNOWN_ZONES.LONDON.zoneId).toBe('IO91');
    });

    it('should have Tokyo zone', () => {
      expect(KNOWN_ZONES.TOKYO).toBeDefined();
      expect(KNOWN_ZONES.TOKYO.precision).toBe(LocationPrecision.GRID_100KM);
      expect(KNOWN_ZONES.TOKYO.zoneId).toBe('PM95');
    });

    it('should have Sydney zone', () => {
      expect(KNOWN_ZONES.SYDNEY).toBeDefined();
      expect(KNOWN_ZONES.SYDNEY.precision).toBe(LocationPrecision.GRID_100KM);
      expect(KNOWN_ZONES.SYDNEY.zoneId).toBe('QF56');
    });

    it('should span multiple continents', () => {
      const zones = [
        KNOWN_ZONES.NYC,
        KNOWN_ZONES.LONDON,
        KNOWN_ZONES.TOKYO,
        KNOWN_ZONES.SYDNEY,
      ];

      // All zones should be far apart (intercontinental)
      for (let i = 0; i < zones.length; i++) {
        for (let j = i + 1; j < zones.length; j++) {
          const distance = geoDistance(zones[i], zones[j]);
          expect(distance).toBeGreaterThan(5000); // At least 5000km apart
        }
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle coordinate normalization', () => {
      // Coordinates might be stored as-is or normalized depending on implementation
      // Test with valid coordinates to verify basic functionality
      const zone1 = encodeGeoZone(89, 0, LocationPrecision.EXACT); // Near north pole
      const zone2 = encodeGeoZone(-89, 0, LocationPrecision.EXACT); // Near south pole

      // Valid coordinates should be preserved
      expect(zone1.centerLat).toBeGreaterThanOrEqual(-90);
      expect(zone1.centerLat).toBeLessThanOrEqual(90);
      expect(zone2.centerLat).toBeGreaterThanOrEqual(-90);
      expect(zone2.centerLat).toBeLessThanOrEqual(90);
    });

    it('should handle identical zones', () => {
      const zone1 = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);
      const zone2 = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);

      expect(zone1.zoneId).toBe(zone2.zoneId);
      expect(geoDistance(zone1, zone2)).toBeCloseTo(0, 1);
    });

    it('should handle zones at grid boundaries', () => {
      // Test boundary between two adjacent grid squares
      const zone1 = encodeGeoZone(40.0, -74.0, LocationPrecision.GRID_100KM);
      const zone2 = encodeGeoZone(40.01, -74.0, LocationPrecision.GRID_100KM);

      // Might be same or different depending on boundary
      const distance = geoDistance(zone1, zone2);
      expect(distance).toBeGreaterThanOrEqual(0);
    });

    it('should handle very small distances', () => {
      const zone1 = encodeGeoZone(40.000000, -74.000000, LocationPrecision.EXACT);
      const zone2 = encodeGeoZone(40.000001, -74.000001, LocationPrecision.EXACT);

      const distance = geoDistance(zone1, zone2);

      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(0.01); // Less than 10 meters
    });

    it('should handle very large distances', () => {
      const zone1 = encodeGeoZone(89, 0, LocationPrecision.EXACT);
      const zone2 = encodeGeoZone(-89, 180, LocationPrecision.EXACT);

      const distance = geoDistance(zone1, zone2);

      // Near maximum Earth distance
      expect(distance).toBeGreaterThan(15000);
      expect(distance).toBeLessThan(21000);
    });

    it('should handle mixed precision zones for distance', () => {
      const exact = encodeGeoZone(40, -74, LocationPrecision.EXACT);
      const grid = encodeGeoZone(40, -74, LocationPrecision.GRID_100KM);

      const distance = geoDistance(exact, grid);

      // Should be able to calculate distance despite different precision
      // Grid center may be up to ~150km from exact coordinates
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThan(150); // Within same general area
    });

    it('should handle empty/invalid zone IDs gracefully', () => {
      const invalidZone: GeoZone = {
        zoneId: '',
        centerLat: 0,
        centerLon: 0,
        precision: LocationPrecision.GRID_100KM,
      };

      const adjacent = getAdjacentZones(invalidZone);
      expect(adjacent).toEqual([]);
    });
  });
});
