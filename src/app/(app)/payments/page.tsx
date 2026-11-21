import { prisma } from '@/server/db';
import { PaymentForm } from './payment-form';

export const runtime = 'nodejs';

export default async function RecordPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ memberId?: string }>;
}) {
  const { memberId } = await searchParams;

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
        select: { id: true, loanNo: true, principalOutstanding: true },
      },
      dues: {
        where: { status: { in: ['PENDING', 'PARTIAL'] } },
        select: { id: true, bsYear: true, bsMonth: true, amount: true, paidAmount: true },
      },
      fines: {
        where: { status: { in: ['PENDING', 'PARTIAL'] } },
        select: { id: true, type: true, amount: true, paidAmount: true, waivedAmount: true, postedOn: true },
      },
    },
    orderBy: { memberNo: 'asc' },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Record Payment</h1>
        <p className="text-sm text-muted-foreground">
          Post contribution savings or loan repayments with live double-entry preview
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
          })),
          dues: m.dues.map((d) => ({
            id: d.id,
            bsYear: d.bsYear,
            bsMonth: d.bsMonth,
            amount: d.amount.toString(),
            paidAmount: d.paidAmount.toString(),
          })),
          fines: m.fines.map((f) => ({
            id: f.id,
            type: f.type,
            amount: f.amount.toString(),
            paidAmount: f.paidAmount.toString(),
            waivedAmount: f.waivedAmount.toString(),
            postedOn: f.postedOn.toISOString(),
          })),
        }))}
        defaultMemberId={memberId}
      />
    </div>
  );
}
