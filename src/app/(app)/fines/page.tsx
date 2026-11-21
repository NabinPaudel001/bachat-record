import { prisma } from '@/server/db';
import { requireRole } from '@/server/auth/rbac';
import { formatNPR } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Role } from '@prisma/client';
import { WaiveFineModal } from './waive-modal';

export const runtime = 'nodejs';

export default async function FinesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { type, status } = await searchParams;
  const user = await requireRole(Role.ADMIN, Role.TREASURER, Role.HELPER);
  const isAdmin = user.role === Role.ADMIN;

  const fines = await prisma.fine.findMany({
    where: {
      type: type ? (type as 'CONTRIBUTION' | 'LOAN_INTEREST') : undefined,
      status: status ? (status as 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED') : undefined,
    },
    include: {
      member: { select: { id: true, memberNo: true, fullName: true } },
    },
    orderBy: { postedOn: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fines & Penalties</h1>
          <p className="text-sm text-muted-foreground">
            Manage overdue contribution and loan interest penalty fines, payments, and waivers
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <form method="GET" className="flex flex-wrap items-center gap-3">
            <select
              name="type"
              defaultValue={type ?? ''}
              className="h-9 rounded border bg-background px-3 text-sm"
            >
              <option value="">All Fine Types</option>
              <option value="CONTRIBUTION">Contribution Fines (NPR 200)</option>
              <option value="LOAN_INTEREST">Loan Interest Fines (NPR 100)</option>
            </select>
            <select
              name="status"
              defaultValue={status ?? ''}
              className="h-9 rounded border bg-background px-3 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending (Unpaid)</option>
              <option value="PARTIAL">Partially Paid</option>
              <option value="PAID">Paid in Full</option>
              <option value="WAIVED">Waived by Admin</option>
            </select>
            <button
              type="submit"
              className="h-9 rounded bg-secondary px-4 text-sm font-medium hover:bg-secondary/80"
            >
              Filter
            </button>
            <Link href="/fines" className="text-xs text-muted-foreground hover:underline ml-auto">
              Clear filters
            </Link>
          </form>
        </CardContent>
      </Card>

      {/* Fines Table */}
      <Card>
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-base">Fines Log ({fines.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
              <tr>
                <th className="p-3">Member</th>
                <th className="p-3">Type</th>
                <th className="p-3">Posted Date</th>
                <th className="p-3 text-right">Fine Amount</th>
                <th className="p-3 text-right">Paid</th>
                <th className="p-3 text-right">Waived</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {fines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No fines recorded.
                  </td>
                </tr>
              ) : (
                fines.map((f) => {
                  const amt = Number(f.amount);
                  const paid = Number(f.paidAmount);
                  const waived = Number(f.waivedAmount);
                  const remaining = Math.max(0, amt - paid - waived);

                  return (
                    <tr key={f.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">
                        <Link href={`/members/${f.member.id}`} className="text-primary hover:underline">
                          {f.member.fullName} ({f.member.memberNo})
                        </Link>
                      </td>
                      <td className="p-3 font-mono text-xs">{f.type}</td>
                      <td className="p-3 text-muted-foreground">
                        {f.postedOn.toISOString().split('T')[0]}
                      </td>
                      <td className="p-3 text-right font-mono">{formatNPR(amt)}</td>
                      <td className="p-3 text-right font-mono text-emerald-600">
                        {formatNPR(paid)}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {formatNPR(waived)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          variant={
                            f.status === 'PAID'
                              ? 'success'
                              : f.status === 'WAIVED'
                              ? 'secondary'
                              : 'warning'
                          }
                          className="text-[10px]"
                        >
                          {f.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        {isAdmin && remaining > 0 ? (
                          <WaiveFineModal
                            fineId={f.id}
                            memberInfo={`${f.member.fullName} (${f.member.memberNo})`}
                            remainingAmount={remaining}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
