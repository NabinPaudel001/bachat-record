import { prisma } from '@/server/db';
import { requireRole } from '@/server/auth/rbac';
import { formatNPR } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Role } from '@prisma/client';
import { CapitaliseModal } from './capitalise-modal';
import { ApproveLoanButton } from '../approve-button';

export const runtime = 'nodejs';

export default async function LoanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(Role.ADMIN, Role.TREASURER, Role.HELPER);

  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      borrower: true,
      guarantors: { include: { member: true } },
      periods: { orderBy: [{ bsYear: 'desc' }, { bsMonth: 'desc' }] },
      events: { orderBy: { eventDate: 'desc' } },
    },
  });

  if (!loan) notFound();

  const isAdmin = user.role === Role.ADMIN;

  // Calculate unpaid accrued interest
  let totalUnpaidInterest = 0;
  for (const p of loan.periods) {
    const unp = Number(p.accrued) - Number(p.paid) - Number(p.capitalised);
    if (unp > 0) totalUnpaidInterest += unp;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Loan {loan.loanNo}</h1>
            <Badge
              variant={
                loan.status === 'ACTIVE'
                  ? 'success'
                  : loan.status === 'PENDING_APPROVAL'
                  ? 'warning'
                  : 'secondary'
              }
            >
              {loan.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Borrower:{' '}
            <Link href={`/members/${loan.borrower.id}`} className="font-semibold text-primary hover:underline">
              {loan.borrower.fullName} ({loan.borrower.memberNo})
            </Link>{' '}
            • Disbursed: {loan.disbursedOn ? loan.disbursedOn.toISOString().split('T')[0] : 'Pending'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {loan.status === 'PENDING_APPROVAL' && isAdmin && (
            <ApproveLoanButton
              loan={{
                id: loan.id,
                loanNo: loan.loanNo,
                amount: loan.amount.toString(),
                rateAtStart: loan.rateAtStart.toString(),
                purpose: loan.purpose,
                borrower: {
                  fullName: loan.borrower.fullName,
                  memberNo: loan.borrower.memberNo,
                },
              }}
            />
          )}
          {loan.status === 'ACTIVE' && (
            <>
              <Link
                href={`/payments?memberId=${loan.borrowerId}`}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 shadow-sm"
              >
                Record Repayment
              </Link>
              {isAdmin && totalUnpaidInterest > 0 && (
                <CapitaliseModal
                  loanId={loan.id}
                  loanNo={loan.loanNo}
                  totalUnpaidInterest={totalUnpaidInterest}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Original Disbursed</div>
          <div className="text-xl font-bold font-mono mt-1">{formatNPR(loan.amount.toString())}</div>
        </Card>
        <Card className="p-4 border-blue-200">
          <div className="text-xs font-semibold text-blue-600">Principal Outstanding</div>
          <div className="text-xl font-bold font-mono mt-1 text-blue-700">
            {formatNPR(loan.principalOutstanding.toString())}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Unpaid Accrued Interest</div>
          <div className="text-xl font-bold font-mono mt-1 text-amber-600">
            {formatNPR(totalUnpaidInterest)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Initial Rate at Start</div>
          <div className="text-xl font-bold font-mono mt-1">{loan.rateAtStart.toString()}% p.a.</div>
        </Card>
      </div>

      {/* Guarantors & Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-sm font-semibold">3 Active Guarantors (Reference Only)</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {loan.guarantors.map((g, idx) => (
              <div key={g.id} className="p-2.5 border rounded flex justify-between items-center text-sm">
                <div>
                  <span className="font-medium">
                    {idx + 1}. {g.member.fullName}
                  </span>
                  <span className="text-xs text-muted-foreground block">{g.member.memberNo}</span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Ref Only (Not Liable)
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-sm font-semibold">Loan Purpose & Timeline</CardTitle>
          </CardHeader>
          <CardContent className="p-4 text-sm space-y-2 text-muted-foreground">
            <p>
              <strong className="text-foreground">Purpose:</strong> {loan.purpose || 'Not specified'}
            </p>
            <p>
              <strong className="text-foreground">Interest Method:</strong> Daily accrual based on 365 days, billed at the end of each BS month.
            </p>
            <p>
              <strong className="text-foreground">Rate Policy:</strong> Global floating rate. Rate adjustments apply to all active loans automatically from their effective date.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Loan Events & History */}
      <Card>
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-sm font-semibold">Principal & Capitalisation Events</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Event Type</th>
                <th className="p-3 text-right">Event Amount</th>
                <th className="p-3 text-right">Principal After</th>
                <th className="p-3">Reason / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loan.events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">
                    No events recorded yet.
                  </td>
                </tr>
              ) : (
                loan.events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-muted/20">
                    <td className="p-3 text-muted-foreground">
                      {ev.eventDate.toISOString().split('T')[0]}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          ev.type === 'CAPITALISE'
                            ? 'warning'
                            : ev.type === 'DISBURSE'
                            ? 'default'
                            : 'success'
                        }
                        className="text-[10px]"
                      >
                        {ev.type}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-mono font-medium">
                      {formatNPR(ev.amount.toString())}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-blue-700">
                      {formatNPR(ev.principalAfter.toString())}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{ev.reason || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
