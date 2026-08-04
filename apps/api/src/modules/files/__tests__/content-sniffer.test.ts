/**
 * The bytes decide, not the filename.
 *
 * The case this exists for: a Windows executable renamed `passport.pdf` and uploaded as
 * `application/pdf`. Every check that trusts the envelope passes it; the signature check
 * does not.
 */

import { HostileType, SniffedType, sniffContent } from '../content-sniffer.js';
import { AssetPurpose, MAX_UPLOAD_BYTES } from '../files.constants.js';
import { assessUpload, describeAllowed } from '../upload-policy.js';

/** Builds a file head from a hex signature plus filler, as a real file would look. */
function fileStartingWith(hex: string, fillerBytes = 512): Uint8Array {
  return Buffer.concat([Buffer.from(hex, 'hex'), Buffer.alloc(fillerBytes, 0x20)]);
}

const PDF = fileStartingWith('255044462d312e37');
const PNG = fileStartingWith('89504e470d0a1a0a');
const JPEG = fileStartingWith('ffd8ffe000104a464946');
const WINDOWS_EXE = fileStartingWith('4d5a90000300000004000000');
const ELF = fileStartingWith('7f454c4602010100');
const ZIP = fileStartingWith('504b0304140000000800');
const SHELL = Buffer.from('#!/bin/sh\nrm -rf /\n', 'utf8');

describe('identifying a file by its bytes', () => {
  it('recognises a PDF', () => {
    expect(sniffContent(PDF)).toEqual({ kind: 'RECOGNISED', contentType: SniffedType.PDF });
  });

  it('recognises a PNG and a JPEG', () => {
    expect(sniffContent(PNG)).toEqual({ kind: 'RECOGNISED', contentType: SniffedType.PNG });
    expect(sniffContent(JPEG)).toEqual({ kind: 'RECOGNISED', contentType: SniffedType.JPEG });
  });

  it('recognises a WebP by its RIFF payload marker, not its container', () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF', 'utf8'),
      Buffer.alloc(4),
      Buffer.from('WEBP', 'utf8'),
      Buffer.alloc(64),
    ]);

    expect(sniffContent(webp)).toEqual({ kind: 'RECOGNISED', contentType: SniffedType.WEBP });
  });

  it('refuses a Windows executable', () => {
    expect(sniffContent(WINDOWS_EXE)).toEqual({
      kind: 'REJECTED',
      reason: HostileType.WINDOWS_EXECUTABLE,
    });
  });

  it('refuses a Linux binary, an archive and a script', () => {
    expect(sniffContent(ELF)).toMatchObject({ kind: 'REJECTED' });
    expect(sniffContent(ZIP)).toMatchObject({ kind: 'REJECTED', reason: HostileType.ARCHIVE });
    expect(sniffContent(SHELL)).toMatchObject({
      kind: 'REJECTED',
      reason: HostileType.SHELL_SCRIPT,
    });
  });

  it('reports an unrecognisable file as unknown rather than guessing', () => {
    expect(sniffContent(Buffer.alloc(64, 0x7f))).toEqual({ kind: 'UNKNOWN' });
  });
});

describe('deciding whether an upload may be stored', () => {
  it('accepts a passport scan as a PDF', () => {
    const verdict = assessUpload({
      purpose: AssetPurpose.IDENTITY_DOCUMENT,
      bytes: PDF,
      sizeBytes: PDF.byteLength,
    });

    expect(verdict).toEqual({ accepted: true, contentType: SniffedType.PDF });
  });

  it('rejects an executable renamed as a document, on its bytes', () => {
    const verdict = assessUpload({
      purpose: AssetPurpose.IDENTITY_DOCUMENT,
      bytes: WINDOWS_EXE,
      sizeBytes: WINDOWS_EXE.byteLength,
    });

    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) throw new Error('unreachable');

    expect(verdict.reason).toContain('a Windows program');
    expect(verdict.reason).toContain('whatever its name suggests');
  });

  it('rejects a format that is real but not allowed for this purpose', () => {
    const verdict = assessUpload({
      purpose: AssetPurpose.PROFILE_PHOTO,
      bytes: PDF,
      sizeBytes: PDF.byteLength,
    });

    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) throw new Error('unreachable');
    expect(verdict.reason).toContain('PDF');
  });

  it('rejects an SVG for a customer document, because it can carry script', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', 'utf8');

    const verdict = assessUpload({
      purpose: AssetPurpose.IDENTITY_DOCUMENT,
      bytes: svg,
      sizeBytes: svg.byteLength,
    });

    expect(verdict.accepted).toBe(false);
  });

  it('rejects a file over the size limit before looking at it', () => {
    const verdict = assessUpload({
      purpose: AssetPurpose.IDENTITY_DOCUMENT,
      bytes: PDF,
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    });

    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) throw new Error('unreachable');
    expect(verdict.reason).toContain('15MB');
  });

  it('phrases the accepted formats as a person would read them', () => {
    expect(describeAllowed(AssetPurpose.PROOF_OF_ADDRESS)).toBe('a PDF, JPEG or PNG');
  });
});
