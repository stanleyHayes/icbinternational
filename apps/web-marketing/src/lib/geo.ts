/**
 * Distance between two points on the globe.
 *
 * The haversine formula, in kilometres. This is the one place in the app where floating
 * point is correct: it is a geographic measurement, not money, and the answer is rounded
 * to whole metres before anything renders it.
 */

const EARTH_RADIUS_METRES = 6_371_000;
const DEGREES_IN_HALF_TURN = 180;

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / DEGREES_IN_HALF_TURN;
}

/** Great-circle distance between two points, in whole metres. */
export function distanceMetres(from: Coordinates, to: Coordinates): number {
  const HALF = 2;
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);

  const chord =
    Math.sin(deltaLatitude / HALF) ** HALF +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLongitude / HALF) ** HALF;

  return Math.round(EARTH_RADIUS_METRES * HALF * Math.asin(Math.min(1, Math.sqrt(chord))));
}
