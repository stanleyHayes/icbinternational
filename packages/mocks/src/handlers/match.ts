/**
 * Path matching, written out rather than borrowed from MSW.
 *
 * The route-coverage test needs to answer "is there a handler for this contract path?"
 * without starting a server or a worker. Reaching into MSW's internal matcher to do that
 * would couple the most important test in this package to an implementation detail of a
 * dependency; forty lines of segment comparison will not surprise anyone.
 */

const WILDCARD = '*';
const PARAM_PREFIX = ':';

/**
 * True when a handler pattern matches a concrete path.
 *
 * A pattern is a leading `*` — which absorbs any origin — followed by a path such as
 * `/v1/accounts/:id`. A `:name` segment matches exactly one path segment; everything
 * else must match literally.
 */
export function matchPath(pattern: string, concretePath: string): boolean {
  const patternSegments = segments(stripWildcard(pattern));
  const pathSegments = segments(stripOrigin(concretePath));

  if (patternSegments.length !== pathSegments.length) return false;

  return patternSegments.every((patternSegment, index) => {
    const pathSegment = pathSegments[index];
    if (pathSegment === undefined) return false;
    if (patternSegment.startsWith(PARAM_PREFIX)) return pathSegment.length > 0;
    return patternSegment === pathSegment;
  });
}

/** Extracts named parameters from a concrete path. Assumes the pattern matches. */
export function extractParams(pattern: string, concretePath: string): Record<string, string> {
  const patternSegments = segments(stripWildcard(pattern));
  const pathSegments = segments(stripOrigin(concretePath));
  const params: Record<string, string> = {};

  patternSegments.forEach((patternSegment, index) => {
    if (!patternSegment.startsWith(PARAM_PREFIX)) return;
    const value = pathSegments[index];
    if (value !== undefined) params[patternSegment.slice(1)] = value;
  });

  return params;
}

function stripWildcard(pattern: string): string {
  return pattern.startsWith(WILDCARD) ? pattern.slice(WILDCARD.length) : pattern;
}

function stripOrigin(path: string): string {
  const schemeEnd = path.indexOf('://');
  if (schemeEnd === -1) return path.split('?')[0] ?? path;
  const afterScheme = path.slice(schemeEnd + '://'.length);
  const firstSlash = afterScheme.indexOf('/');
  const withoutOrigin = firstSlash === -1 ? '/' : afterScheme.slice(firstSlash);
  return withoutOrigin.split('?')[0] ?? withoutOrigin;
}

function segments(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}
