import { prisma } from '@/server/db';
import { requireRole } from '@/server/auth/rbac';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { Role } from '@prisma/client';
import { FinesList, FineData } from './fines-list';

export const runtime = 'nodejs';

export default async function FinesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; search?: string }>;
}) {
  const { type, status, search } = await searchParams;
  const user = await requireRole(Role.ADMIN, Role.TREASURER, Role.HELPER);
  const isAdmin = user.role === Role.ADMIN;

  const finesRaw = await prisma.fine.findMany({
    where: {
      type: type ? (type as 'CONTRIBUTION' | 'LOAN_INTEREST') : undefined,
      status: status ? (status as 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED') : undefined,
      member: search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { memberNo: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
    },
    include: {
      member: { select: { id: true, memberNo: true, fullName: true, phone: true } },
    },
    orderBy: { postedOn: 'desc' },
  });

  const fines: FineData[] = finesRaw.map((f) => ({
    id: f.id,
    type: f.type,
    amount: Number(f.amount),
    paidAmount: Number(f.paidAmount),
    waivedAmount: Number(f.waivedAmount),
    postedOn: f.postedOn.toISOString().split('T')[0],
    status: f.status,
    member: {
      id: f.member.id,
      memberNo: f.member.memberNo,
      fullName: f.member.fullName,
      phone: f.member.phone,
    },
  }));

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
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                name="search"
                defaultValue={search ?? ''}
                placeholder="Search member by name, number, or phone..."
                className="h-9 w-full rounded border bg-background px-3 text-sm placeholder:text-muted-foreground"
              />
            </div>
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

      {/* Fines List (Member-wise Accordion & Summaries) */}
      <FinesList fines={fines} isAdmin={isAdmin} />
    </div>
  );
}
