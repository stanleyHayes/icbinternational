import { Injectable } from '@nestjs/common';
import { monotonicFactory } from 'ulid';

import { ID_PREFIX, PREFIXED_ID_PATTERN } from '@reliance/contracts';

export type EntityKind = keyof typeof ID_PREFIX;

/**
 * Public identifier generation.
 *
 * Mongo `ObjectId`s never leave the database. Public ids are prefixed ULIDs: the prefix
 * makes a stray identifier in a log or a bug report self-describing, and ULIDs sort
 * lexicographically by creation time, which makes them usable directly as pagination
 * cursors without a secondary sort key.
 */
@Injectable()
export class IdGenerator {
  /** Monotonic within a millisecond, so two ids minted together still sort in order. */
  private readonly ulid = monotonicFactory();

  generate(kind: EntityKind): string {
    return `${ID_PREFIX[kind]}_${this.ulid()}`;
  }

  /** Extracts the creation instant encoded in a ULID. */
  timestampOf(id: string): Date {
    const [, ulidPart] = id.split('_');
    if (!ulidPart) throw new RangeError(`Not a prefixed identifier: ${id}`);
    return new Date(decodeUlidTime(ulidPart));
  }

  static isValid(id: string): boolean {
    return PREFIXED_ID_PATTERN.test(id);
  }

  /** Checks an id belongs to the expected entity, e.g. that an `acc_` was not passed a `crd_`. */
  static isKind(id: string, kind: EntityKind): boolean {
    return IdGenerator.isValid(id) && id.startsWith(`${ID_PREFIX[kind]}_`);
  }
}

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_CHARACTERS = 10;
const RADIX = 32;

function decodeUlidTime(ulid: string): number {
  return [...ulid.slice(0, TIME_CHARACTERS)].reduce((total, character) => {
    const value = CROCKFORD_ALPHABET.indexOf(character);
    if (value === -1) throw new RangeError(`Invalid ULID character: ${character}`);
    return total * RADIX + value;
  }, 0);
}
