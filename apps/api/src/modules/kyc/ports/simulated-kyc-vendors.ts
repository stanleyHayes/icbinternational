/**
 * The in-house twins of the identity-verification vendors.
 *
 * Deterministic, keyed draws — the same pattern as the payment rails (`rails/kernel`):
 * every verdict is a pure function of the configured seed and the artefact being
 * checked. A sequential generator would silently re-roll every later decision when one
 * unrelated check was added; a draw keyed on the document id cannot reshuffle, which is
 * what makes "why was this passport rejected?" answerable by replaying the scenario.
 *
 * Failure rates are deliberately non-zero. A vendor that always says yes teaches the
 * review queue nothing; roughly three uploads in a hundred come back unreadable and four
 * selfies in a hundred trip the spoof check, which is what keeps the MORE_INFO path and
 * the retake flow exercised in day-to-day development.
 */

import { Injectable } from '@nestjs/common';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppConfigService } from '../../../config/config.service.js';
import { BPS_TOTAL, seededInt, seededString } from '../../../rails/kernel/seeded-random.js';

import {
  LivenessPort,
  LivenessVerdict,
  OcrPort,
  OcrVerdict,
  type LivenessInput,
  type LivenessResult,
  type OcrExtraction,
  type OcrInput,
} from './kyc-vendor.ports.js';

/** Basis points (of 10_000) in which a document reads as unreadable. */
const OCR_UNREADABLE_BPS = 300;
/** Basis points in which a selfie trips the spoof check. */
const LIVENESS_SPOOF_BPS = 400;

/** Confidence/score ranges a real vendor would report, in basis points. */
const OCR_CONFIDENCE_FLOOR_BPS = 8_000;
const LIVENESS_SCORE_FLOOR_BPS = 7_000;

/** Document-number format: nine characters, no look-alikes (0/O, 1/I). */
const DOCUMENT_NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DOCUMENT_NUMBER_LENGTH = 9;
const VENDOR_REFERENCE_ALPHABET = '0123456789ABCDEF';
const VENDOR_REFERENCE_LENGTH = 12;

/** Document validity window: at least six months out, never more than ten years. */
const EXPIRY_MIN_DAYS = 180;
const EXPIRY_SPAN_DAYS = 3_470;
const HOURS_PER_DAY = 24;

/** Length of the calendar-date prefix of an ISO timestamp (`YYYY-MM-DD`). */
const ISO_DATE_LENGTH = 10;

/** Deterministic OCR twin. The same document id always reads the same way. */
@Injectable()
export class SimulatedOcrVendor extends OcrPort {
  constructor(
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {
    super();
  }

  extract(input: OcrInput): Promise<OcrExtraction> {
    const seed = this.config.simulation.seed;
    const key = `ocr|${input.documentId}`;

    if (seededInt(seed, `${key}|legible`, BPS_TOTAL) < OCR_UNREADABLE_BPS) {
      return Promise.resolve({
        verdict: OcrVerdict.UNREADABLE,
        confidenceBps: seededInt(seed, `${key}|confidence`, OCR_CONFIDENCE_FLOOR_BPS),
        documentNumber: null,
        expiresOn: null,
      });
    }

    const span = BPS_TOTAL - OCR_CONFIDENCE_FLOOR_BPS;
    return Promise.resolve({
      verdict: OcrVerdict.READABLE,
      confidenceBps: OCR_CONFIDENCE_FLOOR_BPS + seededInt(seed, `${key}|confidence`, span),
      documentNumber: seededString(
        seed,
        `${key}|number`,
        DOCUMENT_NUMBER_LENGTH,
        DOCUMENT_NUMBER_ALPHABET,
      ),
      expiresOn: this.expiresOn(key),
    });
  }

  /** A deterministic expiry date between six months and ten years out, ISO `YYYY-MM-DD`. */
  private expiresOn(key: string): string {
    const days =
      EXPIRY_MIN_DAYS + seededInt(this.config.simulation.seed, `${key}|expiry`, EXPIRY_SPAN_DAYS);
    return this.clock
      .inHours(days * HOURS_PER_DAY)
      .toISOString()
      .slice(0, ISO_DATE_LENGTH);
  }
}

/** Deterministic liveness twin. The same selfie id always scores the same way. */
@Injectable()
export class SimulatedLivenessVendor extends LivenessPort {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  check(input: LivenessInput): Promise<LivenessResult> {
    const seed = this.config.simulation.seed;
    const key = `liveness|${input.selfieDocumentId}`;
    const spoof = seededInt(seed, `${key}|verdict`, BPS_TOTAL) < LIVENESS_SPOOF_BPS;
    const span = BPS_TOTAL - LIVENESS_SCORE_FLOOR_BPS;

    return Promise.resolve({
      verdict: spoof ? LivenessVerdict.SPOOF_SUSPECT : LivenessVerdict.LIVE,
      scoreBps: LIVENESS_SCORE_FLOOR_BPS + seededInt(seed, `${key}|score`, span),
      reference: seededString(
        seed,
        `${key}|ref`,
        VENDOR_REFERENCE_LENGTH,
        VENDOR_REFERENCE_ALPHABET,
      ),
    });
  }
}
