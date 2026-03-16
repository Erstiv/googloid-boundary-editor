// Point-in-polygon (ray casting) - polygon is [[lon,lat], ...]
export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Distance from point to line segment in feet
export function pointToSegmentDistFt(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  const dlonFt = (px - cx) * 69.0 * Math.cos((42.3 * Math.PI) / 180) * 5280;
  const dlatFt = (py - cy) * 69.0 * 5280;
  return Math.sqrt(dlonFt * dlonFt + dlatFt * dlatFt);
}

// Check if parcel centroid is within thresholdFt of any boundary edge
export function parcelNearBoundary(lon, lat, polygon, thresholdFt = 200) {
  for (let i = 0; i < polygon.length - 1; i++) {
    if (pointToSegmentDistFt(lon, lat, polygon[i][0], polygon[i][1], polygon[i + 1][0], polygon[i + 1][1]) < thresholdFt) return true;
  }
  return false;
}

// Polygon area in square miles using shoelace formula with degree-to-mile conversion
export function polygonAreaSqMi(polygon) {
  const cosLat = Math.cos((42.3 * Math.PI) / 180);
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0] * cosLat * 69.0;
    const yi = polygon[i][1] * 69.0;
    const xj = polygon[j][0] * cosLat * 69.0;
    const yj = polygon[j][1] * 69.0;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area / 2);
}

// Get parcels inside or touching the boundary
export function getParcelsInBoundary(parcels, polygon, touchThresholdFt = 200) {
  if (!polygon || polygon.length < 3) return [];
  const closed = polygon[0][0] === polygon[polygon.length - 1][0] && polygon[0][1] === polygon[polygon.length - 1][1]
    ? polygon : [...polygon, polygon[0]];
  return parcels.filter(p => {
    const lon = p.centroid_lon || 0, lat = p.centroid_lat || 0;
    return pointInPolygon(lon, lat, closed) || parcelNearBoundary(lon, lat, closed, touchThresholdFt);
  });
}
