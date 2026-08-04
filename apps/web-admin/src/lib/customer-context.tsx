/**
 * Whose data is on screen.
 *
 * When an operator opens a customer's record they are looking at somebody's salary, their
 * address and every payment they have made. The console says so, on every screen, for as
 * long as it is true — a banner the operator cannot miss rather than a line in a log
 * nobody reads. Accountability that is visible while the work happens changes behaviour;
 * accountability discovered afterwards only assigns blame.
 *
 * A screen declares its subject with {@link useCustomerSubject}; the shell renders the
 * banner. The two are decoupled so a feature screen never has to know the chrome exists.
 */

'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** An active impersonation grant, when the operator is acting through one. */
export interface ImpersonationGrantSummary {
  /** ISO-8601 instant the grant lapses. */
  readonly expiresAt: string;
  /** True when the grant permits reading only, which is the default the platform issues. */
  readonly readOnly: boolean;
}

/** The customer whose data the current screen is showing. */
export interface CustomerSubject {
  /** The customer's public id, e.g. `usr_01J…`. */
  readonly id: string;
  /** The customer's name, as it should appear in the banner. */
  readonly name: string;
  /** Present only while the operator is inside an impersonation grant. */
  readonly impersonation?: ImpersonationGrantSummary;
}

interface CustomerContextValue {
  readonly subject: CustomerSubject | null;
  readonly setSubject: (subject: CustomerSubject | null) => void;
}

const CustomerContext = createContext<CustomerContextValue | null>(null);

/** Holds the customer currently on screen. Mount once, inside the console shell. */
export function CustomerContextProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [subject, setSubject] = useState<CustomerSubject | null>(null);
  const value = useMemo(() => ({ subject, setSubject }), [subject]);
  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

function useCustomerContextValue(): CustomerContextValue {
  const value = useContext(CustomerContext);
  if (!value) throw new Error('Customer context is only available inside the console shell.');
  return value;
}

/** The customer the banner is currently declaring, or `null` on a non-customer screen. */
export function useCustomerSubjectValue(): CustomerSubject | null {
  return useCustomerContextValue().subject;
}

/** The subject reduced to comparable primitives, so an effect can depend on its parts. */
function flatten(subject: CustomerSubject | null) {
  const grant = subject?.impersonation;
  return {
    id: subject?.id ?? null,
    name: subject?.name ?? null,
    expiresAt: grant?.expiresAt ?? null,
    readOnly: grant?.readOnly ?? null,
  };
}

/**
 * Declares the customer this screen is showing, for as long as it is mounted.
 *
 * ```tsx
 * useCustomerSubject(customer && { id: customer.id, name: fullName(customer) });
 * ```
 *
 * Pass `null` while the record is still loading; the banner appears with the name and
 * disappears when the operator navigates away.
 */
export function useCustomerSubject(subject: CustomerSubject | null): void {
  const { setSubject } = useCustomerContextValue();
  const { id, name, expiresAt, readOnly } = flatten(subject);

  // Depending on the primitives rather than the object means a caller can build the
  // subject inline on every render without retriggering this effect on every render.
  useEffect(() => {
    if (id === null || name === null) {
      setSubject(null);
      return;
    }

    const impersonation =
      expiresAt === null || readOnly === null ? undefined : { expiresAt, readOnly };
    setSubject({ id, name, impersonation });

    return () => setSubject(null);
  }, [id, name, expiresAt, readOnly, setSubject]);
}
