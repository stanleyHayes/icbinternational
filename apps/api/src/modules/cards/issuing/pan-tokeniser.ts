import { createHmac, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { type CardScheme } from '@reliance/contracts';

import { AppConfigService } from '../../../config/config.service.js';
import {
  CARD_BINS,
  CVV_LENGTH,
  LAST4_LENGTH,
  PAN_LENGTH,
  type BinRange,
} from '../../../rails/card-network/index.js';

/** Bytes of entropy in a token. 128 bits: unguessable, and short enough to index. */
const TOKEN_ENTROPY_BYTES = 16;

/** Prefix marking a value as a card token, so a stray one in a log is self-describing. */
const TOKEN_PREFIX = 'tok';

/** Separator between the token's prefix and its random part. */
const TOKEN_SEPARATOR = '_';

/** Domain separators, so the PAN and the CVV derivations can never collide. */
const PAN_DOMAIN = 'pan';
const CVV_DOMAIN = 'cvv';

/** Radix the derivation reads digits in. */
const DECIMAL_RADIX = 10;

/** Above this, a doubled Luhn digit is folded by subtracting nine. */
const LUHN_FOLD_THRESHOLD = 9;

/** Two-digit year rendering: the last two characters of the four-digit year. */
const SHORT_YEAR_LENGTH = 2;

/** A newly minted card number, held only long enough to be tokenised. */
export interface MintedCard {
  readonly panToken: string;
  readonly last4: string;
  readonly bin: string;
  readonly scheme: CardScheme;
}

/** The one-shot reveal payload. Exists in memory for the length of one response. */
export interface RevealedPan {
  readonly pan: string;
  readonly cvv: string;
  /** `MM/YY`, as printed on the card. */
  readonly expiry: string;
}

/**
 * Card numbers, and the fact that the bank does not keep any.
 *
 * A card is issued by minting a random **token** and deriving its PAN from that token
 * with a keyed HMAC. The token is stored; the PAN is not, in any form — not plaintext,
 * not encrypted, not hashed. A database dump therefore yields no card numbers at all,
 * because the key that turns a token into a number lives in the environment.
 *
 * The derivation is deterministic, so the reveal endpoint can reproduce the same number
 * on demand without anything having been written down. That is the property that makes
 * "store nothing" practical rather than merely aspirational.
 *
 * **Nothing in this file logs.** A PAN reaching a log line is the failure this whole
 * design exists to prevent, and the surest way to guarantee it cannot happen is for the
 * only code that can produce one to have no logger to reach for.
 */
@Injectable()
export class PanTokeniser {
  private readonly key: string;

  constructor(config: AppConfigService) {
    this.key = config.encryptionKey;
  }

  /**
   * Mints a token for a new card on the given scheme's BIN.
   *
   * @throws {RangeError} When no BIN is configured for the scheme — a wiring error, and
   *   one that must stop issuing rather than silently pick another scheme's range.
   */
  mint(scheme: CardScheme): MintedCard {
    const range = binFor(scheme);
    const panToken = `${TOKEN_PREFIX}${TOKEN_SEPARATOR}${randomBytes(TOKEN_ENTROPY_BYTES).toString('hex')}`;

    return {
      panToken,
      bin: range.prefix,
      scheme,
      last4: this.derivePan(panToken, range.prefix).slice(-LAST4_LENGTH),
    };
  }

  /**
   * Reproduces the card's printed details from its token.
   *
   * The only caller is the step-up-protected reveal endpoint. The return value must not
   * be stored, cached, logged or included in an error — it is the card.
   */
  reveal(input: {
    panToken: string;
    bin: string;
    expiryMonth: number;
    expiryYear: number;
  }): RevealedPan {
    return {
      pan: this.derivePan(input.panToken, input.bin),
      cvv: this.deriveCvv(input.panToken),
      expiry: formatExpiry(input.expiryMonth, input.expiryYear),
    };
  }

  /** The last four digits of the number a token resolves to. */
  last4For(panToken: string, bin: string): string {
    return this.derivePan(panToken, bin).slice(-LAST4_LENGTH);
  }

  /**
   * Derives the full number: the BIN, HMAC-derived filler, and a Luhn check digit.
   *
   * The check digit is computed rather than drawn, because a number that fails Luhn is
   * rejected by the first terminal that sees it and would make every card this bank
   * issues untestable against real validation code.
   */
  private derivePan(panToken: string, bin: string): string {
    const fillerLength = PAN_LENGTH - bin.length - 1;
    const filler = this.digits(`${PAN_DOMAIN}${TOKEN_SEPARATOR}${panToken}`, fillerLength);
    const body = `${bin}${filler}`;

    return `${body}${luhnCheckDigit(body)}`;
  }

  private deriveCvv(panToken: string): string {
    return this.digits(`${CVV_DOMAIN}${TOKEN_SEPARATOR}${panToken}`, CVV_LENGTH);
  }

  /**
   * A run of decimal digits derived from the key and a message.
   *
   * Each byte of the digest contributes one digit by modulo. The bias that introduces
   * (256 is not a multiple of 10) is irrelevant here: the digits are not a secret, the
   * token is — an attacker who can guess the filler still cannot reach any account
   * without the token, and the token has 128 bits of entropy behind it.
   */
  private digits(message: string, length: number): string {
    const digest = createHmac('sha256', this.key).update(message).digest();
    let output = '';

    for (let index = 0; index < length; index += 1) {
      const byte = digest[index % digest.length] ?? 0;
      output += String(byte % DECIMAL_RADIX);
    }

    return output;
  }
}

/** The issuing BIN for a scheme. */
export function binFor(scheme: CardScheme): BinRange {
  const range = CARD_BINS.find((candidate) => candidate.scheme === scheme);
  if (!range) throw new RangeError(`No issuing BIN is configured for ${scheme}`);
  return range;
}

/**
 * The Luhn check digit for a partial card number.
 *
 * Doubling every second digit from the right and folding the result over nine is the
 * mod-10 algorithm every scheme validates against.
 */
export function luhnCheckDigit(body: string): string {
  const total = [...body].reverse().reduce((sum, character, index) => {
    const digit = Number.parseInt(character, DECIMAL_RADIX);
    if (index % 2 !== 0) return sum + digit;
    const doubled = digit * 2;
    return sum + (doubled > LUHN_FOLD_THRESHOLD ? doubled - LUHN_FOLD_THRESHOLD : doubled);
  }, 0);

  return String((DECIMAL_RADIX - (total % DECIMAL_RADIX)) % DECIMAL_RADIX);
}

/** Whether a number satisfies the mod-10 check every terminal applies. */
export function passesLuhn(pan: string): boolean {
  const body = pan.slice(0, -1);
  return luhnCheckDigit(body) === pan.slice(-1);
}

/** `MM/YY`, as embossed on the card and typed into a checkout. */
export function formatExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${String(year).slice(-SHORT_YEAR_LENGTH)}`;
}
