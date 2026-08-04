/**
 * Reading query parameters that arrived from outside.
 *
 * Next hands a repeated parameter over as an array, so `?next=/a&next=/b` is `string[]`. Every
 * consumer wanting one value would otherwise write the same narrowing, and the one that forgot
 * would compare an array to a string and quietly always miss.
 */

/** The parameters of a page, as Next provides them. */
export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/**
 * The first value of a parameter, or `null`.
 *
 * Repeated parameters take the first: a link with two `?next=` values is either a mistake or an
 * attempt to confuse the parser, and both are answered the same way.
 */
export function firstParam(params: SearchParams, name: string): string | null {
  const value = params[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}
