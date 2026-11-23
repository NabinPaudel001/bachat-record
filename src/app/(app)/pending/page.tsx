import { prisma } from '@/server/db';
import Decimal from 'decimal.js';
import PendingTabs, {
  PendingLevyRow,
  PendingFineRow,
  PendingInterestRow,
} from './pending-tabs';

export const runtime = 'nodejs';

export default async function PendingCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = 'levy' } = await searchParams;

  // ─── Fetch all data in parallel ───
  const [pendingDues, pendingFines, pendingInterest] = await Promise.all([
    // 1. Pending Monthly Levy
    prisma.contributionDue.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL'] } },
      include: { member: { select: { id: true, memberNo: true, fullName: true, phone: true } } },
      orderBy: [{ bsYear: 'asc' }, { bsMonth: 'asc' }],
    }),

    // 2. Pending Fines (both CONTRIBUTION and LOAN_INTEREST types)
    prisma.fine.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL'] } },
      include: { member: { select: { id: true, memberNo: true, fullName: true, phone: true } } },
      orderBy: { postedOn: 'asc' },
    }),

    // 3. Pending Loan Interest Periods (accrued > paid + capitalised)
    prisma.loanInterestPeriod.findMany({
      where: {
        loan: { status: 'ACTIVE' },
      },
      include: {
        loan: {
          select: {
            id: true,
            loanNo: true,
            borrower: { select: { id: true, memberNo: true, fullName: true, phone: true } },
          },
        },
      },
      orderBy: [{ bsYear: 'asc' }, { bsMonth: 'asc' }],
    }),
  ]);

  // ─── Transform data into serialisable rows ───

  // Monthly Levy rows
  const levyRows: PendingLevyRow[] = pendingDues.map((d) => ({
    id: d.id,
    bsYear: d.bsYear,
    bsMonth: d.bsMonth,
    amount: d.amount.toString(),
    paidAmount: d.paidAmount.toString(),
    status: d.status,
    member: d.member,
  }));

  // Split fines by type
  const levyFineRows: PendingFineRow[] = [];
  const loanFineRows: PendingFineRow[] = [];

  for (const f of pendingFines) {
    const row: PendingFineRow = {
      id: f.id,
      type: f.type,
      amount: f.amount.toString(),
      paidAmount: f.paidAmount.toString(),
      waivedAmount: f.waivedAmount.toString(),
      postedOn: f.postedOn.toISOString().split('T')[0],
      status: f.status,
      member: f.member,
    };
    if (f.type === 'CONTRIBUTION') {
      levyFineRows.push(row);
    } else {
      loanFineRows.push(row);
    }
  }

  // Loan Interest rows (only those with unpaid interest > 0)
  const loanInterestRows: PendingInterestRow[] = [];
  for (const p of pendingInterest) {
    const accrued = new Decimal(p.accrued.toString());
    const paid = new Decimal(p.paid.toString());
    const cap = new Decimal(p.capitalised.toString());
    const unpaid = accrued.minus(paid).minus(cap);
    if (unpaid.gt(0)) {
      loanInterestRows.push({
        id: p.id,
        loanId: p.loan.id,
        loanNo: p.loan.loanNo,
        bsYear: p.bsYear,
        bsMonth: p.bsMonth,
        accrued: accrued.toString(),
        paid: paid.toString(),
        capitalised: cap.toString(),
        memberFullName: p.loan.borrower.fullName,
        memberNo: p.loan.borrower.memberNo,
        memberId: p.loan.borrower.id,
        memberPhone: p.loan.borrower.phone,
      });
    }
  }

  // ─── Calculate totals and member counts ───
  const totalLevy = levyRows.reduce(
    (s, d) => s.plus(new Decimal(d.amount).minus(new Decimal(d.paidAmount))),
    new Decimal(0)
  );

  const totalLevyFine = levyFineRows.reduce(
    (s, f) => s.plus(new Decimal(f.amount).minus(new Decimal(f.paidAmount)).minus(new Decimal(f.waivedAmount))),
    new Decimal(0)
  );

  const totalLoanInterest = loanInterestRows.reduce(
    (s, p) => s.plus(new Decimal(p.accrued).minus(new Decimal(p.paid)).minus(new Decimal(p.capitalised))),
    new Decimal(0)
  );

  const totalLoanFine = loanFineRows.reduce(
    (s, f) => s.plus(new Decimal(f.amount).minus(new Decimal(f.paidAmount)).minus(new Decimal(f.waivedAmount))),
    new Decimal(0)
  );

  // Count unique members per category
  const levyMembers = new Set(levyRows.map((r) => r.member.id)).size;
  const levyFineMembers = new Set(levyFineRows.map((r) => r.member.id)).size;
  const loanInterestMembers = new Set(loanInterestRows.map((r) => r.memberId)).size;
  const loanFineMembers = new Set(loanFineRows.map((r) => r.member.id)).size;

  // Map tab query param to TabKey
  const tabKey = (['levy', 'levyFine', 'loanInterest', 'loanFine'] as const).includes(tab as any)
    ? (tab as 'levy' | 'levyFine' | 'loanInterest' | 'loanFine')
    : 'levy';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending Center</h1>
          <p className="text-sm text-muted-foreground">
            Track unpaid monthly levies, overdue fines, loan interest, and receivables
          </p>
        </div>
      </div>

      <PendingTabs
        levyRows={levyRows}
        levyFineRows={levyFineRows}
        loanInterestRows={loanInterestRows}
        loanFineRows={loanFineRows}
        totals={{
          levy: totalLevy.toFixed(2),
          levyFine: totalLevyFine.toFixed(2),
          loanInterest: totalLoanInterest.toFixed(2),
          loanFine: totalLoanFine.toFixed(2),
        }}
        counts={{
          levy: levyMembers,
          levyFine: levyFineMembers,
          loanInterest: loanInterestMembers,
          loanFine: loanFineMembers,
        }}
        initialTab={tabKey}
      />
    </div>
  );
}
