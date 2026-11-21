import { prisma } from '@/server/db';
import { formatNPR, bsMonthName } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import Decimal from 'decimal.js';

export const runtime = 'nodejs';

export default async function PendingCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = 'contributions' } = await searchParams;

  // Pending Contributions
  const pendingDues = await prisma.contributionDue.findMany({
    where: { status: { in: ['PENDING', 'PARTIAL'] } },
    include: { member: { select: { id: true, memberNo: true, fullName: true, phone: true } } },
    orderBy: [{ bsYear: 'asc' }, { bsMonth: 'asc' }],
  });

  // Pending Fines
  const pendingFines = await prisma.fine.findMany({
    where: { status: { in: ['PENDING', 'PARTIAL'] } },
    include: { member: { select: { id: true, memberNo: true, fullName: true, phone: true } } },
    orderBy: { postedOn: 'asc' },
  });

  // Calculate totals
  const totalPendingContributions = pendingDues.reduce(
    (sum, d) => sum.plus(new Decimal(d.amount.toString()).minus(new Decimal(d.paidAmount.toString()))),
    new Decimal(0)
  );

  const totalPendingFines = pendingFines.reduce(
    (sum, f) =>
      sum.plus(
        new Decimal(f.amount.toString())
          .minus(new Decimal(f.paidAmount.toString()))
          .minus(new Decimal(f.waivedAmount.toString()))
      ),
    new Decimal(0)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending Center</h1>
          <p className="text-sm text-muted-foreground">
            Track unpaid monthly contributions, overdue fines, and receivables
          </p>
        </div>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 border-rose-200">
          <div className="text-xs font-semibold text-rose-600">Pending Contributions Total</div>
          <div className="text-2xl font-bold mt-1 font-mono text-rose-700">
            {formatNPR(totalPendingContributions)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Across {pendingDues.length} unpaid monthly installments
          </div>
        </Card>

        <Card className="p-4 border-orange-200">
          <div className="text-xs font-semibold text-orange-600">Pending Fines Total</div>
          <div className="text-2xl font-bold mt-1 font-mono text-orange-700">
            {formatNPR(totalPendingFines)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Across {pendingFines.length} uncollected fines
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-6 text-sm font-medium">
        <Link
          href="/pending?tab=contributions"
          className={`pb-2 border-b-2 transition-colors ${
            tab === 'contributions'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Pending Contributions ({pendingDues.length})
        </Link>
        <Link
          href="/pending?tab=fines"
          className={`pb-2 border-b-2 transition-colors ${
            tab === 'fines'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Pending Fines ({pendingFines.length})
        </Link>
      </div>

      {/* Table Content */}
      {tab === 'contributions' && (
        <Card>
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-base">Unpaid Contribution Dues</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="p-3">Member</th>
                  <th className="p-3">BS Month</th>
                  <th className="p-3 text-right">Due Amount</th>
                  <th className="p-3 text-right">Paid</th>
                  <th className="p-3 text-right">Owed</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingDues.map((d) => {
                  const owed = new Decimal(d.amount.toString()).minus(new Decimal(d.paidAmount.toString()));
                  return (
                    <tr key={d.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">
                        <Link href={`/members/${d.member.id}`} className="text-primary hover:underline">
                          {d.member.fullName} ({d.member.memberNo})
                        </Link>
                        <span className="block text-xs text-muted-foreground">{d.member.phone}</span>
                      </td>
                      <td className="p-3">
                        {d.bsYear} {bsMonthName(d.bsMonth)}
                      </td>
                      <td className="p-3 text-right font-mono">{formatNPR(d.amount.toString())}</td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {formatNPR(d.paidAmount.toString())}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-rose-600">
                        {formatNPR(owed)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="destructive" className="text-[10px]">
                          {d.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/payments?memberId=${d.member.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Collect →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === 'fines' && (
        <Card>
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-base">Pending Penalty Fines</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="p-3">Member</th>
                  <th className="p-3">Penalty Type</th>
                  <th className="p-3">Posted Date</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-right">Paid</th>
                  <th className="p-3 text-right">Owed</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingFines.map((f) => {
                  const owed = new Decimal(f.amount.toString())
                    .minus(new Decimal(f.paidAmount.toString()))
                    .minus(new Decimal(f.waivedAmount.toString()));
                  return (
                    <tr key={f.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">
                        <Link href={`/members/${f.member.id}`} className="text-primary hover:underline">
                          {f.member.fullName} ({f.member.memberNo})
                        </Link>
                      </td>
                      <td className="p-3">{f.type}</td>
                      <td className="p-3 text-muted-foreground">
                        {f.postedOn.toISOString().split('T')[0]}
                      </td>
                      <td className="p-3 text-right font-mono">{formatNPR(f.amount.toString())}</td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {formatNPR(f.paidAmount.toString())}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-orange-600">
                        {formatNPR(owed)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="warning" className="text-[10px]">
                          {f.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/fines?fineId=${f.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Review →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
