/**
 * Distance and bounding boxes for the branch and ATM locator.
 *
 * Coordinates are handled as integer microdegrees — millionths of a degree, roughly a
 * tenth of a metre — everywhere they are stored, compared or indexed. Two reasons, and the
 * second is the load-bearing one:
 *
 * 1. A branch's position is fixed reference data, and an integer is exact.
 * 2. The banking core bans floating-point literals, because a float that finds its way
 *    into money is a defect that compounds. A rule with exceptions is not a rule, so this
 *    file keeps to it rather than arguing that coordinates are different.
 *
 * Trigonometry still happens in doubles — there is no other way to compute a great-circle
 * distance — but only inside {@link distanceMetres}, and the result is rounded to whole
 * metres before it leaves.
 *
 * Pure and dependency-free.
 */

import { MICRODEGREES_PER_DEGREE } from '../cms.constants.js';

/** The extremes a coordinate may take, in degrees and in the stored integer form. */
export const MAX_LATITUDE_DEGREES = 90;
export const MAX_LONGITUDE_DEGREES = 180;
export const MAX_LATITUDE_MICRO = MAX_LATITUDE_DEGREES * MICRODEGREES_PER_DEGREE;
export const MAX_LONGITUDE_MICRO = MAX_LONGITUDE_DEGREES * MICRODEGREES_PER_DEGREE;

/** Mean radius of the Earth, in metres. */
const EARTH_RADIUS_METRES = 6_371_008;
const DEGREES_PER_HALF_TURN = 180;
const HALF = 2;

export interface Point {
  readonly latitudeMicro: number;
  readonly longitudeMicro: number;
}

export interface BoundingBox {
  readonly minLatitudeMicro: number;
  readonly maxLatitudeMicro: number;
  readonly minLongitudeMicro: number;
  readonly maxLongitudeMicro: number;
}

const toDegrees = (micro: number): number => micro / MICRODEGREES_PER_DEGREE;
const toRadians = (degrees: number): number => (degrees * Math.PI) / DEGREES_PER_HALF_TURN;

/** Converts a decimal-degree coordinate to the integer form everything else uses. */
export function toMicrodegrees(degrees: number): number {
  return Math.round(degrees * MICRODEGREES_PER_DEGREE);
}

/** Converts back, for the wire format the contract specifies. */
export function toDecimalDegrees(micro: number): number {
  return toDegrees(micro);
}

/**
 * Great-circle distance in whole metres.
 *
 * Haversine. Accurate to well within a metre at city scale, which is two orders of
 * magnitude better than the question "which branch is nearest?" requires.
 */
export function distanceMetres(from: Point, to: Point): number {
  const lat1 = toRadians(toDegrees(from.latitudeMicro));
  const lat2 = toRadians(toDegrees(to.latitudeMicro));
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(toDegrees(to.longitudeMicro - from.longitudeMicro));

  const chord =
    Math.sin(deltaLat / HALF) ** HALF +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / HALF) ** HALF;

  return Math.round(HALF * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(chord))));
}

/**
 * A box guaranteed to contain every point within `radiusMetres` of `centre`.
 *
 * The box is the cheap first pass: the database can use an index on it, and the exact
 * haversine distance is then computed only for the handful of rows that survive. Doing
 * the trigonometry in the query instead would mean a collection scan on every search.
 *
 * Longitude degrees shorten towards the poles, so the longitude span is divided by the
 * cosine of the latitude. At a pole that cosine approaches zero, so the span is clamped to
 * a half turn rather than allowed to run away.
 */
export function boundingBox(centre: Point, radiusMetres: number): BoundingBox {
  const latitudeSpanMicro = toMicrodegrees(
    (radiusMetres / EARTH_RADIUS_METRES) * (DEGREES_PER_HALF_TURN / Math.PI),
  );

  const cosine = Math.cos(toRadians(toDegrees(centre.latitudeMicro)));
  const longitudeSpanMicro =
    cosine <= 0
      ? DEGREES_PER_HALF_TURN * MICRODEGREES_PER_DEGREE
      : Math.min(
          DEGREES_PER_HALF_TURN * MICRODEGREES_PER_DEGREE,
          Math.round(latitudeSpanMicro / cosine),
        );

  return {
    minLatitudeMicro: centre.latitudeMicro - latitudeSpanMicro,
    maxLatitudeMicro: centre.latitudeMicro + latitudeSpanMicro,
    minLongitudeMicro: centre.longitudeMicro - longitudeSpanMicro,
    maxLongitudeMicro: centre.longitudeMicro + longitudeSpanMicro,
  };
}

/** Parses a `"latitude,longitude"` query parameter, or `null` when it is not one. */
export function parsePoint(value: string): Point | null {
  const [latitude, longitude] = value.split(',').map((part) => Number(part.trim()));

  if (latitude === undefined || longitude === undefined) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > MAX_LATITUDE_DEGREES) return null;
  if (Math.abs(longitude) > MAX_LONGITUDE_DEGREES) return null;

  return { latitudeMicro: toMicrodegrees(latitude), longitudeMicro: toMicrodegrees(longitude) };
}
