import { Injectable } from '@nestjs/common';

/**
 * In-memory stores for business banking entities.
 *
 * Business banking is the multi-user account surface: a company account with
 * multiple authorised members, invoice financing, payroll integration and a
 * separate approval workflow with per-member spending limits.
 *
 * All stores are process-local (dev/demo).
 */

export interface BusinessMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READ_ONLY';
  spendLimitAmount: string | null;
  spendLimitCurrency: string | null;
  addedAt: string;
}

export interface BusinessInvoice {
  id: string;
  reference: string;
  counterpartyName: string;
  dueDate: string;
  amount: string;
  currency: string;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  createdAt: string;
}

export interface BusinessApproval {
  id: string;
  kind: 'PAYMENT' | 'PAYROLL' | 'INVOICE';
  requestedById: string;
  requestedByName: string;
  amount: string;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  decidedAt: string | null;
  decidedById: string | null;
}

export interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  employeeCount: number;
  totalAmount: string;
  currency: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PROCESSING' | 'COMPLETED';
  createdAt: string;
  processedAt: string | null;
}

@Injectable()
export class BusinessStore {
  private readonly members = new Map<string, BusinessMember>();
  private readonly invoices = new Map<string, BusinessInvoice>();
  private readonly approvals = new Map<string, BusinessApproval>();
  private readonly payrollRuns = new Map<string, PayrollRun>();

  // Members
  listMembers(): BusinessMember[] {
    return [...this.members.values()];
  }
  findMember(id: string): BusinessMember | undefined {
    return this.members.get(id);
  }
  insertMember(m: BusinessMember): void {
    this.members.set(m.id, m);
  }

  // Invoices
  listInvoices(): BusinessInvoice[] {
    return [...this.invoices.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  findInvoice(id: string): BusinessInvoice | undefined {
    return this.invoices.get(id);
  }
  insertInvoice(inv: BusinessInvoice): void {
    this.invoices.set(inv.id, inv);
  }

  // Approvals
  listApprovals(): BusinessApproval[] {
    return [...this.approvals.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  findApproval(id: string): BusinessApproval | undefined {
    return this.approvals.get(id);
  }
  insertApproval(a: BusinessApproval): void {
    this.approvals.set(a.id, a);
  }
  patchApproval(id: string, fields: Partial<BusinessApproval>): BusinessApproval | null {
    const current = this.approvals.get(id);
    if (!current) return null;
    const updated = { ...current, ...fields };
    this.approvals.set(id, updated);
    return updated;
  }

  // Payroll
  listPayrollRuns(): PayrollRun[] {
    return [...this.payrollRuns.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  insertPayrollRun(run: PayrollRun): void {
    this.payrollRuns.set(run.id, run);
  }
}
