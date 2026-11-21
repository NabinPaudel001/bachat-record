import { prisma } from '@/server/db';
import { requireRole } from '@/server/auth/rbac';
import { formatNPR } from '@/lib/format';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Role } from '@prisma/client';
import { ReverseJournalModal } from './reverse-modal';

export const runtime = 'nodejs';

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; account?: string }>;
}) {
  const { from, to, account } = await searchParams;
  const user = await requireRole(Role.ADMIN, Role.TREASURER, Role.HELPER);
  const isAdmin = user.role === Role.ADMIN;

  const accounts = await prisma.account.findMany({ orderBy: { code: 'asc' } });

  const journals = await prisma.journal.findMany({
    where: {
      date: {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      },
      lines: account
        ? {
            some: { account: { code: account } },
          }
        : undefined,
    },
    include: {
      lines: {
        include: { account: true },
      },
    },
    orderBy: { date: 'desc' },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounting Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Immutable double-entry journal entries. Every debit strictly balances every credit.
          </p>
        </div>
      </div>

      {/* Filter Card */}
      <Card>
        <CardContent className="p-4">
          <form method="GET" className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">From:</span>
              <input
                type="date"
                name="from"
                defaultValue={from ?? ''}
                className="h-9 rounded border bg-background px-3 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">To:</span>
              <input
                type="date"
                name="to"
                defaultValue={to ?? ''}
                className="h-9 rounded border bg-background px-3 text-xs"
              />
            </div>
            <select
              name="account"
              defaultValue={account ?? ''}
              className="h-9 rounded border bg-background px-3 text-xs"
            >
              <option value="">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.code}>
                  {a.code} — {a.name} ({a.type})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-9 rounded bg-secondary px-4 text-xs font-medium hover:bg-secondary/80"
            >
              Apply Filter
            </button>
          </form>
        </CardContent>
      </Card>

      {/* Journals List */}
      <div className="space-y-4">
        {journals.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No journal entries match the filter criteria.
          </Card>
        ) : (
          journals.map((j) => {
            const isReversal = !!j.reversesId;
            return (
              <Card key={j.id} className="overflow-hidden">
                <CardHeader className="p-3 bg-muted/30 border-b flex flex-row items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-muted-foreground">
                      {j.date.toISOString().split('T')[0]}
                    </span>
                    <span className="font-semibold text-foreground text-sm">{j.description}</span>
                    {isReversal && <Badge variant="warning">Reversal Entry</Badge>}
                    {j.refType && <Badge variant="outline">{j.refType}</Badge>}
                  </div>
                  {isAdmin && !isReversal && (
                    <ReverseJournalModal journalId={j.id} description={j.description} />
                  )}
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/10 border-b text-muted-foreground uppercase text-[10px]">
                      <tr>
                        <th className="p-2">Account Code</th>
                        <th className="p-2">Account Name</th>
                        <th className="p-2">Type</th>
                        <th className="p-2 text-right">Debit (Dr)</th>
                        <th className="p-2 text-right">Credit (Cr)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {j.lines.map((l) => (
                        <tr key={l.id} className="hover:bg-muted/10">
                          <td className="p-2 font-mono font-medium text-primary">{l.account.code}</td>
                          <td className="p-2">{l.account.name}</td>
                          <td className="p-2 text-muted-foreground">{l.account.type}</td>
                          <td className="p-2 text-right font-mono font-medium">
                            {Number(l.debit) > 0 ? formatNPR(l.debit.toString()) : '—'}
                          </td>
                          <td className="p-2 text-right font-mono font-medium">
                            {Number(l.credit) > 0 ? formatNPR(l.credit.toString()) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
