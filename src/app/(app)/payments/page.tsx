import { prisma } from '@/server/db';
import { syncAllFinancials } from '@/server/services/syncService';
import { PaymentForm } from './payment-form';

export const runtime = 'nodejs';

export default async function RecordPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ memberId?: string }>;
}) {
  const { memberId } = await searchParams;

  // Auto-sync active members' 2083 dues, daily loan interest accruals, and missed fines
  await syncAllFinancials();

  const members = await prisma.member.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      memberNo: true,
      fullName: true,
      monthlyAmount: true,
      advanceBalance: true,
      loans: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          loanNo: true,
          principalOutstanding: true,
          periods: {
            select: {
              id: true,
              bsYear: true,
              bsMonth: true,
              accrued: true,
              paid: true,
              capitalised: true,
              finalised: true,
            },
            orderBy: [{ bsYear: 'asc' }, { bsMonth: 'asc' }],
          },
        },
      },
      dues: {
        select: {
          id: true,
          bsYear: true,
          bsMonth: true,
          amount: true,
          paidAmount: true,
          status: true,
        },
        orderBy: [{ bsYear: 'asc' }, { bsMonth: 'asc' }],
      },
      fines: {
        where: { status: { in: ['PENDING', 'PARTIAL'] } },
        select: {
          id: true,
          type: true,
          amount: true,
          paidAmount: true,
          waivedAmount: true,
          postedOn: true,
          status: true,
        },
        orderBy: { postedOn: 'asc' },
      },
    },
    orderBy: { memberNo: 'asc' },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Record Payment</h1>
        <p className="text-sm text-muted-foreground">
          Post payments with real-time member records, priority deduction, and automatic allocation preview
        </p>
      </div>

      <PaymentForm
        members={members.map((m) => ({
          id: m.id,
          memberNo: m.memberNo,
          fullName: m.fullName,
          monthlyAmount: m.monthlyAmount.toString(),
          advanceBalance: m.advanceBalance.toString(),
          loans: m.loans.map((l) => ({
            id: l.id,
            loanNo: l.loanNo,
            principalOutstanding: l.principalOutstanding.toString(),
            periods: l.periods.map((p) => ({
              id: p.id,
              bsYear: p.bsYear,
              bsMonth: p.bsMonth,
              accrued: p.accrued.toString(),
              paid: p.paid.toString(),
              capitalised: p.capitalised.toString(),
              finalised: p.finalised,
            })),
          })),
          dues: m.dues.map((d) => ({
            id: d.id,
            bsYear: d.bsYear,
            bsMonth: d.bsMonth,
            amount: d.amount.toString(),
            paidAmount: d.paidAmount.toString(),
            status: d.status,
          })),
          fines: m.fines.map((f) => ({
            id: f.id,
            type: f.type,
            amount: f.amount.toString(),
            paidAmount: f.paidAmount.toString(),
            waivedAmount: f.waivedAmount.toString(),
            postedOn: f.postedOn.toISOString(),
            status: f.status,
          })),
        }))}
        defaultMemberId={memberId}
      />
    </div>
  );
}
