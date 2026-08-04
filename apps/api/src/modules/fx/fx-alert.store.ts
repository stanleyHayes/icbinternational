import { type CurrencyCode } from '@reliance/money';

/** Which side of the target the customer is watching for. */
export type AlertDirection = 'ABOVE' | 'BELOW';

/**
 * What a service is allowed to know about rate-alert persistence.
 *
 * Alerts are read by a job on behalf of every customer at once, so the store exposes a
 * cross-customer read — `listArmed` — that no customer-facing path may call. Keeping it
 * on the same abstraction is deliberate: the alternative is a second store with a second
 * set of indexes that drifts out of step with this one.
 */
export abstract class FxAlertStore {
  abstract insert(alert: NewFxAlert): Promise<FxAlertRecord>;

  /** The customer's alerts, newest first. */
  abstract listByUser(userId: string): Promise<readonly FxAlertRecord[]>;

  abstract findById(id: string, userId: string): Promise<FxAlertRecord | null>;

  /** Removes an alert the customer no longer wants. Returns what was removed. */
  abstract remove(id: string, userId: string): Promise<FxAlertRecord | null>;

  /** Every armed alert across every customer, for the evaluation sweep. */
  abstract listArmed(limit: number): Promise<readonly FxAlertRecord[]>;

  /**
   * Disarms an alert and stamps when it fired, and only if it was still armed.
   *
   * Returns null when another sweep got there first. The condition lives in the write so
   * two overlapping sweeps cannot both notify the customer about one crossing.
   */
  abstract markTriggered(id: string, at: Date): Promise<FxAlertRecord | null>;
}

/** A persisted alert as services see it. */
export interface FxAlertRecord {
  readonly id: string;
  readonly userId: string;
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
  readonly direction: AlertDirection;
  /** The level being watched for, as a decimal string. Never a float. */
  readonly targetRate: string;
  /** Armed alerts are evaluated; a fired alert stays for the record but stops watching. */
  readonly active: boolean;
  readonly triggeredAt: Date | null;
  readonly createdAt: Date;
}

/** An alert on its way in: no id, armed, and not yet fired. */
export type NewFxAlert = Omit<FxAlertRecord, 'id' | 'active' | 'triggeredAt'>;
