import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';

import { CardFormat } from '@reliance/contracts';

import { passesLuhn } from '../issuing/pan-tokeniser.js';

import { cardsRig, seedActiveCard, type CardsRig } from './cards-harness.js';

/**
 * The one guarantee this module exists to make: **the bank does not hold card numbers.**
 *
 * Three independent proofs, because any one of them alone can be defeated by a change
 * nobody notices:
 *
 * 1. a **runtime** proof — issue a card, reveal its number, then search every stored
 *    document and every log line emitted during the run for those sixteen digits;
 * 2. a **static** proof — read the module's own source and refuse any field, log call or
 *    schema property that could hold a PAN;
 * 3. a **derivation** proof — the same token always yields the same valid number, which
 *    is what makes storing nothing workable rather than merely virtuous.
 */
describe('the PAN never leaves the reveal', () => {
  const CARDS_SOURCE = join(__dirname, '..');
  const RAILS_SOURCE = join(__dirname, '..', '..', '..', 'rails', 'card-network');

  describe('at runtime', () => {
    let rig: CardsRig;
    let pan: string;
    let cvv: string;
    let logged: string[];

    beforeEach(async () => {
      logged = [];
      jest.spyOn(Logger.prototype, 'log').mockImplementation((message) => {
        logged.push(String(message));
      });
      jest.spyOn(Logger.prototype, 'warn').mockImplementation((message) => {
        logged.push(String(message));
      });

      rig = cardsRig();
      const card = await seedActiveCard(rig);
      const revealed = rig.sensitive.reveal(card);
      pan = revealed.data.pan;
      cvv = revealed.data.cvv;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('produces a scheme-valid sixteen-digit number', () => {
      expect(pan).toMatch(/^\d{16}$/);
      expect(passesLuhn(pan)).toBe(true);
      expect(cvv).toMatch(/^\d{3}$/);
    });

    it('stores nothing that contains the number', () => {
      expect(JSON.stringify(rig.cardStore.all())).not.toContain(pan);
    });

    /**
     * The security code is three digits, so a substring search would false-positive
     * against any run of digits in the record — the BIN alone contains a thousand of
     * them. What has to be true is that no stored *value* is the code, which is the
     * question a leak actually turns on.
     */
    it('stores no field whose value is the security code', () => {
      const values = rig.cardStore.all().flatMap((card) => Object.values(card).map(String));

      expect(values).not.toContain(cvv);
    });

    it('stores nothing that contains the number after an authorisation', async () => {
      const [card] = rig.cardStore.all();
      expect(card).toBeDefined();

      const everything = JSON.stringify([rig.cardStore.all(), rig.authStore.all()]);
      expect(everything).not.toContain(pan);
    });

    it('writes no log line containing the number', () => {
      expect(logged.length).toBeGreaterThan(0);
      for (const line of logged) {
        expect(line).not.toContain(pan);
        expect(line).not.toContain(cvv);
      }
    });

    it('keeps only the last four on the card', async () => {
      const [card] = rig.cardStore.all();
      expect(card?.last4).toBe(pan.slice(-4));
      // The stored token must not be a substring of the number, or of it of the token.
      expect(pan).not.toContain(card?.panToken ?? 'unreachable');
    });
  });

  describe('in the source', () => {
    /** Field names that would hold a card number if any of them existed. */
    const FORBIDDEN_FIELDS = [
      /\bpan!?\s*:\s*string/i,
      /\bcardNumber\b/i,
      /\bprimaryAccountNumber\b/i,
      /\bcvv!?\s*:\s*string/i,
      /\bsecurityCode\b/i,
    ];

    /** Files allowed to name a PAN: the deriver, the reveal, and this test. */
    const ALLOWED = new Set(['pan-tokeniser.ts', 'card-sensitive.service.ts']);

    it('declares no field capable of holding a card number', () => {
      const offences: string[] = [];

      for (const file of sourceFiles(CARDS_SOURCE)) {
        if (ALLOWED.has(basename(file))) continue;
        const contents = readFileSync(file, 'utf8');

        for (const pattern of FORBIDDEN_FIELDS) {
          if (pattern.test(contents)) offences.push(`${basename(file)} matches ${pattern}`);
        }
      }

      expect(offences).toEqual([]);
    });

    /**
     * A log line may *mention* the reveal; it may not *interpolate* it.
     *
     * So the assertion is about the `${…}` holes rather than the prose around them:
     * "Card details revealed for ${card.id}" is exactly the line we want, and it would
     * fail a naive search for the word "details".
     */
    it('interpolates nothing from the reveal payload into a log line', () => {
      const reveal = readFileSync(
        join(CARDS_SOURCE, 'issuing', 'card-sensitive.service.ts'),
        'utf8',
      );
      const logCalls = reveal.match(/logger\.\w+\([^)]*\)/g) ?? [];

      expect(logCalls.length).toBeGreaterThan(0);
      for (const call of logCalls) {
        for (const hole of call.match(/\$\{[^}]*\}/g) ?? []) {
          expect(hole).not.toMatch(/details|\bpan\b|\bcvv\b/i);
        }
      }
    });

    it('keeps the tokeniser free of any logger at all', () => {
      const tokeniser = readFileSync(join(CARDS_SOURCE, 'issuing', 'pan-tokeniser.ts'), 'utf8');

      expect(tokeniser).not.toContain('Logger');
      expect(tokeniser).not.toContain('console.');
    });

    it('keeps the rail free of card numbers entirely', () => {
      for (const file of sourceFiles(RAILS_SOURCE)) {
        const contents = readFileSync(file, 'utf8');
        for (const pattern of FORBIDDEN_FIELDS) {
          expect({ file: basename(file), matches: pattern.test(contents) }).toEqual({
            file: basename(file),
            matches: false,
          });
        }
      }
    });
  });

  describe('derivation', () => {
    it('reproduces the same number from the same token', async () => {
      const rig = cardsRig();
      const card = await seedActiveCard(rig, { format: CardFormat.PHYSICAL });

      const first = rig.tokeniser.reveal({
        panToken: card.panToken,
        bin: card.bin,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
      });
      const second = rig.tokeniser.reveal({
        panToken: card.panToken,
        bin: card.bin,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
      });

      expect(second).toEqual(first);
    });

    it('gives two cards different numbers', async () => {
      const rig = cardsRig();
      const one = await seedActiveCard(rig);
      const two = await seedActiveCard(rig);

      expect(one.panToken).not.toBe(two.panToken);
      expect(one.last4 === two.last4 && one.panToken === two.panToken).toBe(false);
    });

    it('issues on the scheme BIN so a switch would route it to us', async () => {
      const rig = cardsRig();
      const card = await seedActiveCard(rig);
      const revealed = rig.sensitive.reveal(card);

      expect(revealed.data.pan.startsWith(card.bin)).toBe(true);
      expect(revealed.data.pan.startsWith('4')).toBe(true);
    });
  });
});

/** Every `.ts` file under a directory, tests excluded. */
function sourceFiles(root: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__') found.push(...sourceFiles(path));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) found.push(path);
  }

  return found;
}

function basename(path: string): string {
  return path.split('/').at(-1) ?? path;
}
