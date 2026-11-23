import { prisma } from '@/server/db';
import { getClassRules, evaluateMemberClass } from '@/server/services/memberService';
import { formatBSDate, formatNPR } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { AddMemberModal } from './add-member-modal';
import { AddExistingMemberModal } from './add-existing-member-modal';
import { ResetAllRecordsModal } from './reset-all-modal';

export const runtime = 'nodejs';

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; class?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim().toLowerCase();
  const rawStatus = params.status?.trim();
  const statusFilter = rawStatus === 'ALL' ? 'ALL' : (rawStatus || 'ACTIVE');
  const rawClass = params.class?.trim();
  const classFilter = rawClass && rawClass !== 'ALL' ? rawClass : undefined;

  // Single query for members with their dues
  const rawMembers = await prisma.member.findMany({
    where: {
      status: statusFilter === 'ALL' ? undefined : (statusFilter as 'ACTIVE' | 'CLOSED'),
    },
    include: {
      dues: { select: { amount: true, paidAmount: true, status: true } },
    },
    orderBy: { memberNo: 'asc' },
  });

  // Fetch class rules once (cached in memory) to prevent connection pool exhaustion
  const rules = await getClassRules();

  // Calculate totals and classes synchronously in memory
  const membersWithStats = rawMembers.map((m) => {
    const memberClass = evaluateMemberClass(m.joinDate, m.notes, rules);

    let deposited = new Decimal(0);
    let pending = new Decimal(0);

    for (const d of m.dues) {
      deposited = deposited.plus(new Decimal(d.paidAmount.toString()));
      if (d.status !== 'PAID') {
        pending = pending.plus(
          new Decimal(d.amount.toString()).minus(new Decimal(d.paidAmount.toString()))
        );
      }
    }

    return {
      ...m,
      memberClass,
      deposited,
      pending,
    };
  });

  // Filter in memory for search & class
  const filtered = membersWithStats.filter((m) => {
    if (classFilter) {
      const normFilter = classFilter.replace(/^Class\s*/i, '').trim().toUpperCase();
      const normMember = (m.memberClass || '').replace(/^Class\s*/i, '').trim().toUpperCase();
      if (normMember !== normFilter) return false;
    }
    if (q) {
      const cleanQ = q.replace(/[^a-z0-9]/g, '');
      const matchNo =
        m.memberNo.toLowerCase().includes(q) ||
        (cleanQ.length > 0 && m.memberNo.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanQ));
      const matchName = m.fullName.toLowerCase().includes(q);
      const matchPhone = m.phone.toLowerCase().includes(q);
      const matchAltPhone = m.altPhone ? m.altPhone.toLowerCase().includes(q) : false;
      if (!matchNo && !matchName && !matchPhone && !matchAltPhone) return false;
    }
    return true;
  });

  const totalDeposited = filtered.reduce((sum, m) => sum.plus(m.deposited), new Decimal(0));
  const totalPending = filtered.reduce((sum, m) => sum.plus(m.pending), new Decimal(0));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            Manage savings group members and enrollment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ResetAllRecordsModal />
          <AddExistingMemberModal />
          <AddMemberModal />
        </div>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Showing Members</div>
          <div className="text-xl font-bold mt-1">{filtered.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Total Filtered Deposits</div>
          <div className="text-xl font-bold mt-1 text-emerald-600">{formatNPR(totalDeposited)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Total Filtered Pending</div>
          <div className="text-xl font-bold mt-1 text-rose-600">{formatNPR(totalPending)}</div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <form
            method="GET"
            action="/members"
            key={`${params.q ?? ''}-${statusFilter}-${params.class ?? ''}`}
            className="flex flex-wrap items-center gap-3"
          >
            <input
              type="text"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Search by name, number, phone..."
              className="flex h-9 w-full sm:w-64 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            />
            <select
              name="status"
              defaultValue={statusFilter}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm cursor-pointer"
            >
              <option value="ACTIVE">Active Members</option>
              <option value="CLOSED">Closed Members</option>
              <option value="ALL">All Statuses</option>
            </select>
            <select
              name="class"
              defaultValue={classFilter ?? ''}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm cursor-pointer"
            >
              <option value="">All Classes</option>
              <option value="A">Class A</option>
              <option value="B">Class B</option>
              <option value="C">Class C</option>
              <option value="D">Class D</option>
            </select>
            <button
              type="submit"
              className="h-9 rounded-md bg-secondary px-4 py-1 text-sm font-medium hover:bg-secondary/80 cursor-pointer"
            >
              Filter
            </button>
            {(params.q || (params.status && params.status !== 'ACTIVE') || params.class) && (
              <Link
                href="/members"
                className="text-xs text-muted-foreground hover:underline ml-auto"
              >
                Clear filters
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Members Table */}
      <Card>
        <CardHeader className="p-4 pb-0">
          <CardTitle className="text-base">Members List</CardTitle>
        </CardHeader>
        <CardContent className="p-4 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b text-xs text-muted-foreground uppercase bg-muted/40">
              <tr>
                <th className="p-3">Member No</th>
                <th className="p-3">Full Name</th>
                <th className="p-3">Class</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Join Date (BS)</th>
                <th className="p-3 text-right">Monthly Installment</th>
                <th className="p-3 text-right">Total Deposited</th>
                <th className="p-3 text-right">Pending Due</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-muted-foreground">
                    No members match the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/30">
                    <td className="p-3 font-semibold text-primary">
                      <Link href={`/members/${m.id}`}>{m.memberNo}</Link>
                    </td>
                    <td className="p-3 font-medium">
                      <Link href={`/members/${m.id}`} className="hover:underline">
                        {m.fullName}
                      </Link>
                      {m.previousMemberId && (
                        <span className="block text-xs text-muted-foreground">Rejoined member</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">Class {m.memberClass.replace(/^Class\s*/i, '')}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{m.phone}</td>
                    <td className="p-3 text-muted-foreground">
                      {formatBSDate(m.joinBsYear, m.joinBsMonth, 1)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatNPR(m.monthlyAmount.toString())}
                    </td>
                    <td className="p-3 text-right font-mono font-medium text-emerald-700">
                      {formatNPR(m.deposited)}
                    </td>
                    <td className="p-3 text-right font-mono font-medium text-rose-700">
                      {m.pending.gt(0) ? formatNPR(m.pending) : '—'}
                    </td>
                    <td className="p-3 text-center">
                      <Badge
                        variant={m.status === 'ACTIVE' ? 'success' : 'secondary'}
                        className="text-[10px]"
                      >
                        {m.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        href={`/members/${m.id}`}
                        className="text-xs text-primary font-medium hover:underline"
                      >
                        View Profile →
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
