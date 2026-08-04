import {
  EmploymentStatus,
  KycStatus,
  SourceOfFunds,
  type Profile,
  type UpdateProfileRequest,
} from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { assertUpdatable, changedFields, describeFields } from '../profile-update.rules.js';

/**
 * A fully populated profile.
 *
 * Every field is set, so a test asserting that a patch changed nothing is asserting against
 * a real value rather than against `null` — which would pass for the wrong reason.
 */
function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    userId: 'usr_01HQ0000000000000000000000',
    dateOfBirth: '1990-04-17',
    nationality: 'GB',
    address: {
      line1: '1 Foundry Square',
      line2: null,
      locality: 'London',
      region: null,
      postalCode: 'EC2A 4RQ',
      country: 'GB',
    },
    employmentStatus: EmploymentStatus.EMPLOYED,
    occupation: 'Bricklayer',
    employerName: 'Hollis & Sons',
    annualIncome: { amount: '4200000', currency: 'GBP' },
    sourceOfFunds: SourceOfFunds.SALARY,
    taxResidency: 'GB',
    updatedAt: '2026-01-05T09:00:00.000Z',
    ...overrides,
  } as Profile;
}

/** The error the rules threw, typed, so a test can read its code without casting inline. */
function refusalFrom(run: () => void): AppError {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Expected the patch to be refused, but it was allowed.');
}

describe('assertUpdatable', () => {
  const reviewing: readonly KycStatus[] = [KycStatus.SUBMITTED, KycStatus.UNDER_REVIEW];

  it.each(reviewing)('refuses a reviewed field while the case is %s', (status) => {
    const error = refusalFrom(() => assertUpdatable({ occupation: 'Roofer' }, status));

    expect(error.code).toBe('KYC_PENDING_REVIEW');
    // The customer is told which field is held, not merely that something is.
    expect(error.details).toEqual([
      { path: 'occupation', message: 'Locked while we check your details' },
    ]);
  });

  it.each(reviewing)('allows a field no reviewer is weighing while %s', (status) => {
    // `taxResidency` is in neither locked set: it is not on the identity document and not
    // an input to the decision, so a customer moving country can still say so.
    expect(() => assertUpdatable({ taxResidency: 'IE' }, status)).not.toThrow();
  });

  it('names every held field, not just the first', () => {
    const error = refusalFrom(() =>
      assertUpdatable(
        { occupation: 'Roofer', annualIncome: { amount: '5000000', currency: 'GBP' } },
        KycStatus.UNDER_REVIEW,
      ),
    );

    expect(error.message).toContain('your occupation and your income');
    expect(error.details).toHaveLength(2);
  });

  it('refuses a verified field once the case is approved', () => {
    const error = refusalFrom(() => assertUpdatable({ nationality: 'IE' }, KycStatus.APPROVED));

    expect(error.code).toBe('PRECONDITION_FAILED');
    expect(error.message).toContain('Your nationality');
    expect(error.details).toEqual([{ path: 'nationality', message: 'Call us to change this' }]);
  });

  it('allows an approved customer to change a field the document did not carry', () => {
    // The whole point of separating the two sets: approval locks identity, not the address
    // someone moves to afterwards.
    expect(() =>
      assertUpdatable({ occupation: 'Roofer', taxResidency: 'IE' }, KycStatus.APPROVED),
    ).not.toThrow();
  });

  it.each([KycStatus.NOT_STARTED, KycStatus.IN_PROGRESS, KycStatus.REJECTED])(
    'locks nothing while %s',
    (status) => {
      expect(() =>
        assertUpdatable({ dateOfBirth: '1991-01-01', nationality: 'IE' }, status),
      ).not.toThrow();
    },
  );

  it('allows an empty patch in every status', () => {
    for (const status of Object.values(KycStatus)) {
      expect(() => assertUpdatable({}, status)).not.toThrow();
    }
  });
});

describe('changedFields', () => {
  const current = profile();

  it('reports nothing when the patch re-sends what is already stored', () => {
    const unchanged: UpdateProfileRequest = {
      occupation: current.occupation,
      nationality: current.nationality,
    };

    expect(changedFields(current, unchanged)).toEqual([]);
  });

  it('compares objects structurally, not by identity', () => {
    // A fresh object with identical contents is not a change. Without the structural
    // compare every save would announce an address change to the customer.
    const sameAddress: UpdateProfileRequest = { address: { ...current.address! } };

    expect(changedFields(current, sameAddress)).toEqual([]);
  });

  it('reports an object whose contents differ', () => {
    const moved: UpdateProfileRequest = {
      address: { ...current.address!, postalCode: 'N1 7GU' },
    };

    expect(changedFields(current, moved)).toEqual(['address']);
  });

  it('ignores a field explicitly set to undefined', () => {
    // A caller spreading a partially-built object can hand over an explicit `undefined`.
    // That is "not supplied", not "clear this field".
    const patch = { occupation: undefined, employerName: 'Aldridge Ltd' } as UpdateProfileRequest;

    expect(changedFields(current, patch)).toEqual(['employerName']);
  });

  it('treats null as a change when the stored value is set', () => {
    expect(changedFields(current, { employerName: null })).toEqual(['employerName']);
  });

  it('treats null as unchanged when the stored value is already null', () => {
    const withoutEmployer = profile({ employerName: null });

    expect(changedFields(withoutEmployer, { employerName: null })).toEqual([]);
  });

  it('reports every field that moved, in patch order', () => {
    const patch: UpdateProfileRequest = {
      occupation: 'Roofer',
      nationality: current.nationality,
      taxResidency: 'IE',
    };

    expect(changedFields(current, patch)).toEqual(['occupation', 'taxResidency']);
  });
});

describe('describeFields', () => {
  it('renders one field on its own', () => {
    expect(describeFields(['address'])).toBe('your address');
  });

  it('joins two with "and"', () => {
    expect(describeFields(['address', 'annualIncome'])).toBe('your address and your income');
  });

  it('comma-separates three or more, with "and" before the last', () => {
    expect(describeFields(['address', 'occupation', 'annualIncome'])).toBe(
      'your address, your occupation and your income',
    );
  });

  it('falls back to the field name when there is no everyday label', () => {
    // A field added to the schema without a label still has to render as something.
    expect(describeFields(['middleName'])).toBe('middleName');
  });

  it('renders an empty list as an empty string', () => {
    expect(describeFields([])).toBe('');
  });
});
