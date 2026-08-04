import { DocumentKind } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { type AppConfigService } from '../../../config/config.service.js';
import { LivenessVerdict, OcrVerdict } from '../ports/kyc-vendor.ports.js';
import { SimulatedLivenessVendor, SimulatedOcrVendor } from '../ports/simulated-kyc-vendors.js';

/**
 * The vendor twins' one non-negotiable: determinism. The same artefact checked twice
 * reads the same way — a scenario that cannot be replayed cannot be investigated.
 */

const SEED = 'kyc-vendor-test';
const DRAW_SAMPLE = 500;

function configWith(seed: string): AppConfigService {
  return { simulation: { seed } } as unknown as AppConfigService;
}

function ocrVendor(seed: string = SEED): SimulatedOcrVendor {
  return new SimulatedOcrVendor(configWith(seed), new ClockService());
}

function documentInput(documentId: string) {
  return { documentId, kind: DocumentKind.PASSPORT, fileName: 'passport.pdf' } as const;
}

describe('the simulated OCR vendor', () => {
  it('reads the same document identically every time', async () => {
    const vendor = ocrVendor();
    const first = await vendor.extract(documentInput('doc_repeatable'));
    const second = await vendor.extract(documentInput('doc_repeatable'));
    expect(second).toEqual(first);
  });

  it('keys the draw to the document, not the call order', async () => {
    const vendor = ocrVendor();
    const before = await vendor.extract(documentInput('doc_keyed'));
    await vendor.extract(documentInput('doc_other_1'));
    await vendor.extract(documentInput('doc_other_2'));
    const after = await vendor.extract(documentInput('doc_keyed'));
    expect(after).toEqual(before);
  });

  it('changes its reading when the seed changes', async () => {
    const one = await ocrVendor('seed-one').extract(documentInput('doc_seeded'));
    const two = await ocrVendor('seed-two').extract(documentInput('doc_seeded'));
    expect(one).not.toEqual(two);
  });

  it('reports confident readings with a document number and expiry, none when unreadable', async () => {
    const vendor = ocrVendor();
    const results = await Promise.all(
      Array.from({ length: DRAW_SAMPLE }, (_, i) => vendor.extract(documentInput(`doc_${i}`))),
    );

    const unreadable = results.filter((r) => r.verdict === OcrVerdict.UNREADABLE);
    const readable = results.filter((r) => r.verdict === OcrVerdict.READABLE);

    expect(readable.length).toBeGreaterThan(unreadable.length);
    for (const hit of unreadable) {
      expect(hit.documentNumber).toBeNull();
      expect(hit.expiresOn).toBeNull();
    }
    for (const hit of readable) {
      expect(hit.confidenceBps).toBeGreaterThanOrEqual(8_000);
      expect(hit.documentNumber).toMatch(/^[A-Z2-9]{9}$/);
      expect(hit.expiresOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Some documents must fail: a vendor that always says yes exercises nothing.
    expect(unreadable.length).toBeGreaterThan(0);
  });
});

describe('the simulated liveness vendor', () => {
  it('scores the same selfie identically every time', async () => {
    const vendor = new SimulatedLivenessVendor(configWith(SEED));
    const input = { selfieDocumentId: 'doc_selfie', userId: 'usr_one' };
    expect(await vendor.check(input)).toEqual(await vendor.check(input));
  });

  it('mostly passes live captures, but not always', async () => {
    const vendor = new SimulatedLivenessVendor(configWith(SEED));
    const results = await Promise.all(
      Array.from({ length: DRAW_SAMPLE }, (_, i) =>
        vendor.check({ selfieDocumentId: `doc_s_${i}`, userId: 'usr_one' }),
      ),
    );

    const spoofs = results.filter((r) => r.verdict === LivenessVerdict.SPOOF_SUSPECT);
    expect(spoofs.length).toBeGreaterThan(0);
    expect(spoofs.length).toBeLessThan(results.length / 2);
    for (const result of results) {
      expect(result.scoreBps).toBeGreaterThanOrEqual(7_000);
      expect(result.reference).toMatch(/^[0-9A-F]{12}$/);
    }
  });
});
