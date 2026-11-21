import { prisma } from '@/server/db';
import { requireRole } from '@/server/auth/rbac';
import { formatNPR } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Role } from '@prisma/client';
import { CreateDistributionWizard } from './wizard';

export const runtime = 'nodejs';

export default async function DistributionsPage() {
  const user = await requireRole(Role.ADMIN, Role.TREASURER, Role.HELPER);
  const isAdmin = user.role === Role.ADMIN;

  const distributions = await prisma.distribution.findMany({
    include: {
      lines: {
        include: { member: { select: { id: true, memberNo: true, fullName: true } } },
      },
    },
    orderBy: { confirmedAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dividend & Profit Distributions</h1>
          <p className="text-sm text-muted-foreground">
            Execute quarterly/annual member interest and bonus distributions with double-entry allocation
          </p>
        </div>
        {isAdmin && <CreateDistributionWizard />}
      </div>

      {/* Distribution History */}
      <Card>
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-base">Distribution History ({distributions.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
              <tr>
                <th className="p-3">Type</th>
                <th className="p-3">Period</th>
                <th className="p-3">Date Range</th>
                <th className="p-3 text-right">Percent</th>
                <th className="p-3 text-right">Total Distributed</th>
                <th className="p-3">Payout Mode</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3">Confirmed Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {distributions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No distributions confirmed yet. Admin can click &quot;Run Distribution Run&quot; to initiate a payout.
                  </td>
                </tr>
              ) : (
                distributions.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/20">
                    <td className="p-3 font-semibold text-primary">{d.type}</td>
                    <td className="p-3">{d.period}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {d.fromDate.toISOString().split('T')[0]} to {d.toDate.toISOString().split('T')[0]}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {d.percent ? `${d.percent.toString()}%` : '—'}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600">
                      {formatNPR(d.totalAmount.toString())}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {d.payoutMode}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="success" className="text-[10px]">
                        {d.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {d.confirmedAt ? d.confirmedAt.toISOString().split('T')[0] : '—'}
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
