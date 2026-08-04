import { type Product } from '@reliance/contracts';

import { BUSINESS_CURRENT } from './business-current.product.js';
import { EVERYDAY_CURRENT } from './everyday-current.product.js';
import { FX_WALLET } from './fx-wallet.product.js';
import { RELIANCE_SAVER } from './reliance-saver.product.js';
import { STUDENT_CURRENT } from './student-current.product.js';

/**
 * Version 1 of every product the bank opens with.
 *
 * One file per product rather than one long catalogue: a rate card is the kind of thing
 * that gets reviewed line by line, and a reviewer should be able to open "the student
 * account" and see all of it without scrolling past four others.
 */
export const FOUNDATION_PRODUCTS: readonly Product[] = Object.freeze([
  EVERYDAY_CURRENT,
  RELIANCE_SAVER,
  BUSINESS_CURRENT,
  FX_WALLET,
  STUDENT_CURRENT,
]);

export { BUSINESS_CURRENT, EVERYDAY_CURRENT, FX_WALLET, RELIANCE_SAVER, STUDENT_CURRENT };
