/**
 * Content identification by magic bytes.
 *
 * A file's extension and its declared `Content-Type` are both supplied by whoever is
 * uploading it, so neither is evidence of anything. A Windows executable renamed
 * `passport.pdf` and posted as `application/pdf` satisfies every check that trusts the
 * envelope. The bytes do not lie: `MZ` at offset zero is a PE binary whatever the
 * filename claims, and that is what this module reads.
 *
 * Pure and dependency-free by design — the whole point is that it can be exercised
 * exhaustively against real byte sequences without a storage provider anywhere near it.
 */

import { SNIFF_WINDOW_BYTES } from './files.constants.js';

/** A content type this bank is prepared to store. */
export const SniffedType = {
  PDF: 'application/pdf',
  PNG: 'image/png',
  JPEG: 'image/jpeg',
  GIF: 'image/gif',
  WEBP: 'image/webp',
  HEIC: 'image/heic',
  TIFF: 'image/tiff',
  SVG: 'image/svg+xml',
  CSV: 'text/csv',
} as const;
export type SniffedType = (typeof SniffedType)[keyof typeof SniffedType];

/** A content type that is recognised precisely so it can be refused. */
export const HostileType = {
  WINDOWS_EXECUTABLE: 'WINDOWS_EXECUTABLE',
  LINUX_EXECUTABLE: 'LINUX_EXECUTABLE',
  MACOS_EXECUTABLE: 'MACOS_EXECUTABLE',
  JAVA_CLASS: 'JAVA_CLASS',
  SHELL_SCRIPT: 'SHELL_SCRIPT',
  ARCHIVE: 'ARCHIVE',
} as const;
export type HostileType = (typeof HostileType)[keyof typeof HostileType];

export type SniffOutcome =
  | { readonly kind: 'RECOGNISED'; readonly contentType: SniffedType }
  | { readonly kind: 'REJECTED'; readonly reason: HostileType }
  | { readonly kind: 'UNKNOWN' };

/**
 * A signature, written as hex.
 *
 * Hex strings rather than numeric arrays because a magic number is *literally* what these
 * are, and `'25504446'` transcribed from a format specification is checkable against that
 * specification by eye in a way that a list of decimals is not.
 */
interface Signature {
  readonly hex: string;
  readonly at: number;
  readonly outcome: SniffOutcome;
}

/** Byte offsets a signature can start at. Named because `4` and `8` alone say nothing. */
const AT_START = 0;
/** ISO base-media files carry `ftyp` plus a brand after a four-byte box length. */
const AT_ISO_BRAND = 4;
/** A RIFF container names its payload format after the four-byte chunk size. */
const AT_RIFF_FORMAT = 8;

const accept = (contentType: SniffedType): SniffOutcome => ({ kind: 'RECOGNISED', contentType });
const refuse = (reason: HostileType): SniffOutcome => ({ kind: 'REJECTED', reason });

/**
 * Signatures in evaluation order.
 *
 * Hostile formats come first: `PK\x03\x04` opens a `.docx` and a `.jar` alike, and where a
 * container could hold either, the safe reading is the refusing one.
 */
const SIGNATURES: readonly Signature[] = Object.freeze([
  { hex: '4d5a', at: AT_START, outcome: refuse(HostileType.WINDOWS_EXECUTABLE) },
  { hex: '7f454c46', at: AT_START, outcome: refuse(HostileType.LINUX_EXECUTABLE) },
  { hex: 'cffaedfe', at: AT_START, outcome: refuse(HostileType.MACOS_EXECUTABLE) },
  { hex: 'cefaedfe', at: AT_START, outcome: refuse(HostileType.MACOS_EXECUTABLE) },
  { hex: 'cafebabe', at: AT_START, outcome: refuse(HostileType.JAVA_CLASS) },
  { hex: '2321', at: AT_START, outcome: refuse(HostileType.SHELL_SCRIPT) },
  { hex: '504b0304', at: AT_START, outcome: refuse(HostileType.ARCHIVE) },
  { hex: '504b0506', at: AT_START, outcome: refuse(HostileType.ARCHIVE) },
  { hex: '1f8b', at: AT_START, outcome: refuse(HostileType.ARCHIVE) },
  { hex: '52617221', at: AT_START, outcome: refuse(HostileType.ARCHIVE) },
  { hex: '377abcaf', at: AT_START, outcome: refuse(HostileType.ARCHIVE) },

  { hex: '25504446', at: AT_START, outcome: accept(SniffedType.PDF) },
  { hex: '89504e47', at: AT_START, outcome: accept(SniffedType.PNG) },
  { hex: 'ffd8ff', at: AT_START, outcome: accept(SniffedType.JPEG) },
  { hex: '47494638', at: AT_START, outcome: accept(SniffedType.GIF) },
  { hex: '49492a00', at: AT_START, outcome: accept(SniffedType.TIFF) },
  { hex: '4d4d002a', at: AT_START, outcome: accept(SniffedType.TIFF) },
  { hex: '57454250', at: AT_RIFF_FORMAT, outcome: accept(SniffedType.WEBP) },
  { hex: '6674797068656963', at: AT_ISO_BRAND, outcome: accept(SniffedType.HEIC) },
  { hex: '667479706d696631', at: AT_ISO_BRAND, outcome: accept(SniffedType.HEIC) },
]);

/**
 * Identifies the head of a file.
 *
 * Reads at most {@link SNIFF_WINDOW_BYTES}; a signature that has not declared itself by
 * then is not one we are willing to guess at.
 */
export function sniffContent(bytes: Uint8Array): SniffOutcome {
  const window = bytes.subarray(0, SNIFF_WINDOW_BYTES);

  for (const signature of SIGNATURES) {
    if (matchesAt(window, signature)) return signature.outcome;
  }

  return sniffTextual(window);
}

function matchesAt(window: Uint8Array, signature: Signature): boolean {
  const expected = Buffer.from(signature.hex, 'hex');
  if (window.length < signature.at + expected.length) return false;
  return expected.every((byte, index) => window[signature.at + index] === byte);
}

/**
 * Last resort for the two formats that have no binary signature.
 *
 * SVG is XML and is treated as recognised but is never accepted for customer uploads —
 * it can carry script, and the caller's allow-list is what refuses it.
 */
function sniffTextual(window: Uint8Array): SniffOutcome {
  const head = Buffer.from(window).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || head.includes('<svg')) {
    return accept(SniffedType.SVG);
  }
  if (head.startsWith('<?xml') || head.startsWith('<!doctype') || head.startsWith('<html')) {
    return refuse(HostileType.SHELL_SCRIPT);
  }
  return { kind: 'UNKNOWN' };
}

/** Human-readable name for a refused format, for the message the customer reads. */
export const HOSTILE_TYPE_LABEL: Readonly<Record<HostileType, string>> = Object.freeze({
  [HostileType.WINDOWS_EXECUTABLE]: 'a Windows program',
  [HostileType.LINUX_EXECUTABLE]: 'a Linux program',
  [HostileType.MACOS_EXECUTABLE]: 'a macOS program',
  [HostileType.JAVA_CLASS]: 'a Java program',
  [HostileType.SHELL_SCRIPT]: 'a script',
  [HostileType.ARCHIVE]: 'a compressed archive',
});
