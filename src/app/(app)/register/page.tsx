import { prisma } from '@/server/db';
import { todayBS } from '@/server/engines/bs';
import { formatNPR, BS_MONTHS } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export const runtime = 'nodejs';

export default async function ContributionRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const currentBS = todayBS();
  const targetYear = year ? parseInt(year, 10) : currentBS.year;

  const members = await prisma.member.findMany({
    where: { status: 'ACTIVE' },
    include: {
      dues: {
        where: { bsYear: targetYear },
        include: { fines: true },
      },
    },
    orderBy: { memberNo: 'asc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contribution Register</h1>
          <p className="text-sm text-muted-foreground">
            Monthly installments grid for Bikram Sambat year {targetYear}
          </p>
        </div>

        {/* Year Selector */}
        <div className="flex items-center gap-2">
          <Link
            href={`/register?year=${targetYear - 1}`}
            className="px-3 py-1.5 text-xs rounded border hover:bg-muted font-medium"
          >
            ← {targetYear - 1} BS
          </Link>
          <span className="font-bold text-sm px-2">{targetYear} BS</span>
          <Link
            href={`/register?year=${targetYear + 1}`}
            className="px-3 py-1.5 text-xs rounded border hover:bg-muted font-medium"
          >
            {targetYear + 1} BS →
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="p-4 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Active Members x BS Months Grid</CardTitle>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-500 inline-block" /> Paid
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-amber-500 inline-block" /> Partial
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-rose-500 inline-block" /> Pending
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full ring-2 ring-red-600 inline-block" /> Fine Imposed
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="p-3 text-left sticky left-0 bg-background border-r min-w-[140px]">
                  Member
                </th>
                {BS_MONTHS.map((mName, idx) => (
                  <th key={idx} className="p-2 border-r min-w-[70px]">
                    {mName.slice(0, 4)}
                  </th>
                ))}
                <th className="p-2 min-w-[80px]">Total Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {members.map((m) => {
                const duesByMonth = new Map(m.dues.map((d) => [d.bsMonth, d]));
                let totalPaidYear = 0;

                return (
                  <tr key={m.id} className="hover:bg-muted/20">
                    <td className="p-2 text-left font-medium sticky left-0 bg-background border-r whitespace-nowrap">
                      <Link href={`/members/${m.id}`} className="hover:text-primary font-semibold">
                        {m.memberNo}
                      </Link>
                      <span className="block text-[11px] text-muted-foreground truncate max-w-[130px]">
                        {m.fullName}
                      </span>
                    </td>

                    {BS_MONTHS.map((_, mIdx) => {
                      const monthNum = mIdx + 1;
                      const due = duesByMonth.get(monthNum);

                      if (!due) {
                        return (
                          <td key={monthNum} className="p-2 border-r text-muted-foreground/40">
                            —
                          </td>
                        );
                      }

                      totalPaidYear += Number(due.paidAmount);
                      const hasFine = due.fines.length > 0;

                      let cellBg = 'bg-rose-50 text-rose-700 hover:bg-rose-100';
                      if (due.status === 'PAID') {
                        cellBg = 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
                      } else if (due.status === 'PARTIAL') {
                        cellBg = 'bg-amber-50 text-amber-700 hover:bg-amber-100';
                      }

                      return (
                        <td key={monthNum} className={`p-1 border-r relative ${cellBg} transition-colors`}>
                          <Link
                            href={`/payments?memberId=${m.id}`}
                            className="block py-1.5 px-0.5 rounded font-mono font-medium text-[11px]"
                            title={`Status: ${due.status}. Paid: ${due.paidAmount} of ${due.amount}`}
                          >
                            {due.status === 'PAID'
                              ? '✓'
                              : Number(due.paidAmount) > 0
                              ? Number(due.paidAmount)
                              : 'Due'}
                            {hasFine && (
                              <span
                                className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-red-600 ring-1 ring-white"
                                title="Late fine posted"
                              />
                            )}
                          </Link>
                        </td>
                      );
                    })}

                    <td className="p-2 font-mono font-bold text-right text-emerald-700 whitespace-nowrap">
                      {formatNPR(totalPaidYear)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
