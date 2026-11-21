import { prisma } from '@/server/db';
import { requireRole } from '@/server/auth/rbac';
import { formatNPR } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Role } from '@prisma/client';
import { NewLoanModal } from './new-loan-modal';
import { ApproveLoanButton } from './approve-button';

export const runtime = 'nodejs';

export default async function LoansPage() {
  const user = await requireRole(Role.ADMIN, Role.TREASURER, Role.HELPER);

  const loans = await prisma.loan.findMany({
    include: {
      borrower: { select: { id: true, memberNo: true, fullName: true, phone: true } },
      guarantors: {
        include: { member: { select: { id: true, memberNo: true, fullName: true } } },
      },
    },
    orderBy: { loanNo: 'desc' },
  });

  const activeMembers = await prisma.member.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, memberNo: true, fullName: true },
    orderBy: { memberNo: 'asc' },
  });

  const pendingApprovalLoans = loans.filter((l) => l.status === 'PENDING_APPROVAL');
  const isAdmin = user.role === Role.ADMIN;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Loans Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage member loans, 3-guarantor policies, disbursements, and principal tracking
          </p>
        </div>
        <NewLoanModal activeMembers={activeMembers} />
      </div>

      {/* Admin Approval Queue */}
      {pendingApprovalLoans.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/30 shadow-sm">
          <CardHeader className="p-4 border-b border-amber-200">
            <CardTitle className="text-sm font-bold text-amber-900 flex items-center justify-between">
              <span>Pending Loan Approvals ({pendingApprovalLoans.length})</span>
              <Badge variant="warning">Action Required</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-amber-100/60 border-b border-amber-200 text-amber-900">
                <tr>
                  <th className="p-3">Loan No</th>
                  <th className="p-3">Borrower</th>
                  <th className="p-3 text-right">Requested Amount</th>
                  <th className="p-3">Guarantors (Ref only)</th>
                  <th className="p-3">Purpose</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200">
                {pendingApprovalLoans.map((l) => (
                  <tr key={l.id} className="hover:bg-amber-100/40">
                    <td className="p-3 font-mono font-semibold">{l.loanNo}</td>
                    <td className="p-3">
                      <span className="font-medium">{l.borrower.fullName}</span>
                      <span className="text-xs text-muted-foreground block">{l.borrower.memberNo}</span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-blue-700">
                      {formatNPR(l.amount.toString())}
                    </td>
                    <td className="p-3 text-xs">
                      {l.guarantors.map((g) => g.member.fullName).join(', ')}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{l.purpose || '—'}</td>
                    <td className="p-3 text-right">
                      {isAdmin ? (
                        <ApproveLoanButton loanId={l.id} />
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Admin approval needed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Active & Closed Loans */}
      <Card>
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-base">All Loans List</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
              <tr>
                <th className="p-3">Loan No</th>
                <th className="p-3">Borrower</th>
                <th className="p-3 text-right">Original Principal</th>
                <th className="p-3 text-right">Principal Outstanding</th>
                <th className="p-3">Guarantors</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No loans issued yet.
                  </td>
                </tr>
              ) : (
                loans.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30">
                    <td className="p-3 font-mono font-semibold text-primary">
                      <Link href={`/loans/${l.id}`}>{l.loanNo}</Link>
                    </td>
                    <td className="p-3 font-medium">
                      <Link href={`/members/${l.borrower.id}`} className="hover:underline">
                        {l.borrower.fullName}
                      </Link>
                      <span className="text-xs text-muted-foreground block">{l.borrower.memberNo}</span>
                    </td>
                    <td className="p-3 text-right font-mono">{formatNPR(l.amount.toString())}</td>
                    <td className="p-3 text-right font-mono font-bold text-blue-600">
                      {formatNPR(l.principalOutstanding.toString())}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {l.guarantors.map((g) => g.member.fullName).join(', ')}
                    </td>
                    <td className="p-3 text-center">
                      <Badge
                        variant={
                          l.status === 'ACTIVE'
                            ? 'success'
                            : l.status === 'PENDING_APPROVAL'
                            ? 'warning'
                            : 'secondary'
                        }
                        className="text-[10px]"
                      >
                        {l.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        href={`/loans/${l.id}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Manage Loan →
                      </Link>
                    </td>
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
