import {
  ErrorCode,
  type FeeScheduleEntry,
  type InterestTier,
  type LimitMatrix,
  type Money as WireMoney,
  type Product,
} from '@reliance/contracts';
import { isCurrencyCode, type CurrencyCode } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import {
  fromStored,
  fromWire,
  toStored,
  type StoredMoney,
} from '../../common/money/money.codec.js';

import {
  type FeeScheduleEntrySchemaClass,
  type InterestTierSchemaClass,
  type LimitMatrixSchemaClass,
  type ProductLimitsSchemaClass,
} from './product-pricing.schema.js';
import { type ProductSchemaClass } from './product.schema.js';

/**
 * Turns a stored product version into the wire contract.
 *
 * Amounts go through `Money` rather than being copied field-for-field: the round trip
 * rejects a currency code the storage layer would happily hold, so a corrupted document
 * fails here rather than reaching a client as an amount in a currency that does not exist.
 */
export function toContractProduct(document: ProductSchemaClass): Product {
  return {
    code: document.code,
    version: document.version,
    name: document.name,
    tagline: document.tagline,
    description: document.description,
    accountType: document.accountType,
    currencies: document.currencies.map(assertCurrency),
    minKycTier: document.minKycTier,
    minOpeningBalance: toWireMoney(document.minOpeningBalance),
    minBalance: toWireMoney(document.minBalance),
    monthlyFee: toWireMoney(document.monthlyFee),
    creditInterestTiers: document.creditInterestTiers.map(toContractTier),
    debitInterestBps: document.debitInterestBps,
    fees: document.fees.map(toContractFee),
    limits: toContractLimits(document.limits),
    features: [...document.features],
    active: document.active,
    effectiveFrom: document.effectiveFrom,
    effectiveTo: document.effectiveTo,
  };
}

function toWireMoney(stored: StoredMoney): WireMoney {
  return fromStored(stored).toJSON();
}

/**
 * A currency the bank cannot hold has no business reaching a client.
 *
 * The storage layer accepts any three characters, so the check happens on the way out.
 * It is an internal error rather than a validation failure: the caller did nothing wrong,
 * the catalogue is wrong.
 */
function assertCurrency(code: string): CurrencyCode {
  if (!isCurrencyCode(code)) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'The product catalogue holds an unsupported currency',
      context: { currency: code },
    });
  }
  return code;
}

function toOptionalWireMoney(stored: StoredMoney | null): WireMoney | null {
  return stored ? toWireMoney(stored) : null;
}

function toContractTier(tier: InterestTierSchemaClass): InterestTier {
  return {
    fromAmount: toWireMoney(tier.fromAmount),
    toAmount: toOptionalWireMoney(tier.toAmount),
    annualRateBps: tier.annualRateBps,
  };
}

function toContractFee(fee: FeeScheduleEntrySchemaClass): FeeScheduleEntry {
  return {
    kind: fee.kind,
    label: fee.label,
    flatAmount: toOptionalWireMoney(fee.flatAmount),
    rateBps: fee.rateBps,
    minAmount: toOptionalWireMoney(fee.minAmount),
    maxAmount: toOptionalWireMoney(fee.maxAmount),
    freeAllowancePerMonth: fee.freeAllowancePerMonth,
    waivedForTiers: [...fee.waivedForTiers],
  };
}

function toContractMatrix(matrix: LimitMatrixSchemaClass): LimitMatrix {
  return {
    perTransaction: toOptionalWireMoney(matrix.perTransaction),
    daily: toOptionalWireMoney(matrix.daily),
    monthly: toOptionalWireMoney(matrix.monthly),
    dailyCount: matrix.dailyCount,
  };
}

function toContractLimits(limits: ProductLimitsSchemaClass): Product['limits'] {
  return {
    internalTransfer: toContractMatrix(limits.internalTransfer),
    domesticTransfer: toContractMatrix(limits.domesticTransfer),
    internationalTransfer: toContractMatrix(limits.internationalTransfer),
    cardSpend: toContractMatrix(limits.cardSpend),
    atmWithdrawal: toContractMatrix(limits.atmWithdrawal),
  };
}

// --- Contract to storage ---------------------------------------------------

/** Fields of a stored product version excluding the ones the database owns. */
export type StorableProduct = Omit<ProductSchemaClass, 'id'>;

/**
 * Turns a validated contract product into the document body to persist.
 *
 * Amounts pass through `Money` in this direction too, so a payload that satisfied the
 * Zod schema but names a currency the bank does not hold is rejected before it is stored
 * rather than the first time somebody tries to charge against it.
 */
export function toStorableProduct(product: Product): StorableProduct {
  return {
    code: product.code,
    version: product.version,
    name: product.name,
    tagline: product.tagline,
    description: product.description,
    accountType: product.accountType,
    currencies: [...product.currencies],
    minKycTier: product.minKycTier,
    minOpeningBalance: toStoredMoney(product.minOpeningBalance),
    minBalance: toStoredMoney(product.minBalance),
    monthlyFee: toStoredMoney(product.monthlyFee),
    creditInterestTiers: product.creditInterestTiers.map(toStoredTier),
    debitInterestBps: product.debitInterestBps,
    fees: product.fees.map(toStoredFee),
    limits: toStoredLimits(product.limits),
    features: [...product.features],
    active: product.active,
    effectiveFrom: product.effectiveFrom,
    effectiveTo: product.effectiveTo,
  };
}

function toStoredMoney(wire: WireMoney): StoredMoney {
  return toStored(fromWire(wire));
}

function toOptionalStoredMoney(wire: WireMoney | null): StoredMoney | null {
  return wire ? toStoredMoney(wire) : null;
}

function toStoredTier(tier: InterestTier): InterestTierSchemaClass {
  return {
    fromAmount: toStoredMoney(tier.fromAmount),
    toAmount: toOptionalStoredMoney(tier.toAmount),
    annualRateBps: tier.annualRateBps,
  };
}

function toStoredFee(fee: FeeScheduleEntry): FeeScheduleEntrySchemaClass {
  return {
    kind: fee.kind,
    label: fee.label,
    flatAmount: toOptionalStoredMoney(fee.flatAmount),
    rateBps: fee.rateBps,
    minAmount: toOptionalStoredMoney(fee.minAmount),
    maxAmount: toOptionalStoredMoney(fee.maxAmount),
    freeAllowancePerMonth: fee.freeAllowancePerMonth,
    waivedForTiers: [...fee.waivedForTiers],
  };
}

function toStoredMatrix(matrix: LimitMatrix): LimitMatrixSchemaClass {
  return {
    perTransaction: toOptionalStoredMoney(matrix.perTransaction),
    daily: toOptionalStoredMoney(matrix.daily),
    monthly: toOptionalStoredMoney(matrix.monthly),
    dailyCount: matrix.dailyCount,
  };
}

function toStoredLimits(limits: Product['limits']): ProductLimitsSchemaClass {
  return {
    internalTransfer: toStoredMatrix(limits.internalTransfer),
    domesticTransfer: toStoredMatrix(limits.domesticTransfer),
    internationalTransfer: toStoredMatrix(limits.internationalTransfer),
    cardSpend: toStoredMatrix(limits.cardSpend),
    atmWithdrawal: toStoredMatrix(limits.atmWithdrawal),
  };
}
