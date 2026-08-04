import { Money } from '@reliance/money';

import { allocatePayment, allocatedTotal } from '../payment-allocation.js';

/**
 * Payment allocation: fees, then interest, then principal.
 *
 * The order is a product decision with real money attached, so it is asserted directly
 * rather than inferred from a servicing test. The conservation property — the four parts
 * always sum back to the payment — is checked on every case, because an allocation that
 * loses a penny loses it silently.
 */

const GBP = 'GBP';

function money(major: string): Money {
  return Money.fromMajor(major, GBP);
}

const OWED = {
  fees: money('12.00'),
  interest: money('45.50'),
  principal: money('800.00'),
};

describe('allocatePayment', () => {
  it('fills fees first', () => {
    const allocation = allocatePayment(money('5.00'), OWED);

    expect(allocation.toFees.equals(money('5.00'))).toBe(true);
    expect(allocation.toInterest.isZero).toBe(true);
    expect(allocation.toPrincipal.isZero).toBe(true);
  });

  it('moves to interest only once fees are clear', () => {
    const allocation = allocatePayment(money('30.00'), OWED);

    expect(allocation.toFees.equals(money('12.00'))).toBe(true);
    expect(allocation.toInterest.equals(money('18.00'))).toBe(true);
    expect(allocation.toPrincipal.isZero).toBe(true);
  });

  it('reaches principal only once fees and interest are clear', () => {
    const allocation = allocatePayment(money('157.50'), OWED);

    expect(allocation.toFees.equals(money('12.00'))).toBe(true);
    expect(allocation.toInterest.equals(money('45.50'))).toBe(true);
    expect(allocation.toPrincipal.equals(money('100.00'))).toBe(true);
  });

  it('hands back anything beyond the whole debt rather than absorbing it', () => {
    const allocation = allocatePayment(money('1000.00'), OWED);

    expect(allocation.toPrincipal.equals(money('800.00'))).toBe(true);
    expect(allocation.unallocated.equals(money('142.50'))).toBe(true);
  });

  const payments = ['0.00', '0.01', '11.99', '12.00', '57.49', '57.50', '857.50', '9999.99'];

  it.each(payments)('conserves every penny of a £%s payment', (major) => {
    const payment = money(major);
    const allocation = allocatePayment(payment, OWED);

    const total = allocatedTotal(allocation).plus(allocation.unallocated);
    expect(total.equals(payment)).toBe(true);
  });

  it('allocates nothing from a nil payment', () => {
    const allocation = allocatePayment(money('0.00'), OWED);

    expect(allocatedTotal(allocation).isZero).toBe(true);
  });

  it('skips a bucket that is not owed', () => {
    const allocation = allocatePayment(money('50.00'), { ...OWED, fees: money('0.00') });

    expect(allocation.toFees.isZero).toBe(true);
    expect(allocation.toInterest.equals(money('45.50'))).toBe(true);
    expect(allocation.toPrincipal.equals(money('4.50'))).toBe(true);
  });

  it('refuses to mix currencies rather than quietly converting', () => {
    expect(() => allocatePayment(Money.fromMajor('50.00', 'EUR'), OWED)).toThrow();
  });
});
