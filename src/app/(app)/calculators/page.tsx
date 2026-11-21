import { prisma } from '@/server/db';
import { formatNPR } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { bonusPlanner } from '@/server/engines/calculators';
import Decimal from 'decimal.js';

export const runtime = 'nodejs';

export default async function CalculatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ bonusPct?: string; reservePct?: string }>;
}) {
  const { bonusPct = '6.10', reservePct = '20' } = await searchParams;

  // Aggregate current group metrics
  let totalDeposits = new Decimal(0);
  let totalPendingDues = new Decimal(0);

  const members = await prisma.member.findMany({
    where: { status: 'ACTIVE' },
    include: {
      dues: true,
      loans: { where: { status: 'ACTIVE' } },
    },
  });

  for (const m of members) {
    for (const d of m.dues) {
      totalDeposits = totalDeposits.plus(new Decimal(d.paidAmount.toString()));
      if (d.status !== 'PAID') {
        totalPendingDues = totalPendingDues.plus(
          new Decimal(d.amount.toString()).minus(new Decimal(d.paidAmount.toString()))
        );
      }
    }
  }

  // Bonus base per Section 3.9 includes unpaid scheduled contributions
  const bonusBaseTotal = totalDeposits.plus(totalPendingDues);

  // Income & Expenses for realized profit
  const incomeLines = await prisma.journalLine.findMany({
    where: { account: { type: 'INCOME' } },
  });
  let totalIncome = new Decimal(0);
  for (const l of incomeLines) {
    totalIncome = totalIncome.plus(new Decimal(l.credit.toString())).minus(new Decimal(l.debit.toString()));
  }

  const expenseLines = await prisma.journalLine.findMany({
    where: { account: { type: 'EXPENSE', code: { not: '5000' } } },
  });
  let totalExpense = new Decimal(0);
  for (const l of expenseLines) {
    totalExpense = totalExpense.plus(new Decimal(l.debit.toString())).minus(new Decimal(l.credit.toString()));
  }

  const plannerResult = bonusPlanner({
    realizedIncome: totalIncome,
    expenses: totalExpense,
    pastDistributionsInWindow: 0,
    bonusBase: bonusBaseTotal.gt(0) ? bonusBaseTotal : 1240000,
    reservePercent: Number(reservePct),
    chosenPercent: Number(bonusPct),
    allowReserveDraw: true,
    reserveFloor: 0,
    cashOnHand: 500000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financial Calculators</h1>
        <p className="text-sm text-muted-foreground">
          Interest-to-date projection and Bonus / Reserve Planner (Section 3.10)
        </p>
      </div>

      {/* Bonus Planner Tool */}
      <Card className="border-indigo-200">
        <CardHeader className="p-4 border-b bg-indigo-50/50">
          <CardTitle className="text-base text-indigo-950">
            Bonus & Reserve Planner (Section 3.10 Source of Truth)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <form method="GET" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Reserve Allocation (%) *</label>
              <input
                type="number"
                step="0.5"
                name="reservePct"
                defaultValue={reservePct}
                className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
              />
              <span className="text-[11px] text-muted-foreground">
                Portion of realized profit set aside as reserve
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Chosen Bonus Rate (%) *</label>
              <input
                type="number"
                step="0.05"
                name="bonusPct"
                defaultValue={bonusPct}
                className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
              />
              <span className="text-[11px] text-muted-foreground">
                Suggested max without draw: {plannerResult.suggestedBonusPct.toFixed(2)}%
              </span>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="h-9 w-full rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
              >
                Calculate Simulation
              </button>
            </div>
          </form>

          {/* Planner Side-by-Side Results */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t pt-4 text-sm">
            <div className="p-3 bg-muted/40 rounded">
              <span className="text-xs text-muted-foreground block">Realized Net Profit</span>
              <span className="text-lg font-bold font-mono">
                {formatNPR(plannerResult.realizedNetProfit)}
              </span>
            </div>

            <div className="p-3 bg-muted/40 rounded">
              <span className="text-xs text-muted-foreground block">Initial Reserve</span>
              <span className="text-lg font-bold font-mono">
                {formatNPR(plannerResult.reserve)}
              </span>
            </div>

            <div className="p-3 bg-muted/40 rounded">
              <span className="text-xs text-muted-foreground block">Distributable Pool</span>
              <span className="text-lg font-bold font-mono text-emerald-600">
                {formatNPR(plannerResult.distributable)}
              </span>
            </div>

            <div className="p-3 bg-muted/40 rounded">
              <span className="text-xs text-muted-foreground block">Total Bonus Payout</span>
              <span className="text-lg font-bold font-mono text-indigo-700">
                {formatNPR(plannerResult.chosenBonusAmount)}
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border rounded text-xs space-y-1 text-muted-foreground">
            <p>
              • <strong>Bonus Base includes Unpaid Dues:</strong> Total Base is {formatNPR(bonusBaseTotal.toString())} (Deposited: {formatNPR(totalDeposits.toString())} + Unpaid Pending: {formatNPR(totalPendingDues.toString())}).
            </p>
            {plannerResult.shortfall.gt(0) && (
              <p className="text-amber-800 font-medium">
                • <strong>Reserve Draw Required:</strong> Chosen bonus exceeds distributable by {formatNPR(plannerResult.shortfall)}. Reserve after payout will be {formatNPR(plannerResult.reserveAfter)}.
              </p>
            )}
            {plannerResult.isFloorBreached && (
              <p className="text-rose-600 font-bold">
                • <strong>Floor Breached:</strong> Reserve after payout falls below reserve floor! Confirmation will be blocked.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Per Member Bonus Preview Table */}
      <Card>
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-sm font-semibold">
            Member Projection Table ({bonusPct}% Bonus Simulation)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/40 border-b uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Member</th>
                <th className="p-3 text-right">Deposited</th>
                <th className="p-3 text-right">Unpaid Scheduled</th>
                <th className="p-3 text-right">Total Bonus Base</th>
                <th className="p-3 text-right">Bonus at {bonusPct}%</th>
                <th className="p-3 text-right">Bonus on Unpaid Part</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {members.map((m) => {
                let dep = new Decimal(0);
                let unp = new Decimal(0);
                for (const d of m.dues) {
                  dep = dep.plus(new Decimal(d.paidAmount.toString()));
                  if (d.status !== 'PAID') {
                    unp = unp.plus(new Decimal(d.amount.toString()).minus(new Decimal(d.paidAmount.toString())));
                  }
                }
                const base = dep.plus(unp);
                const pct = new Decimal(bonusPct).div(100);
                const bns = base.mul(pct);
                const bnsOnUnpaid = unp.mul(pct);

                return (
                  <tr key={m.id} className="hover:bg-muted/20">
                    <td className="p-3 font-medium">
                      {m.fullName} ({m.memberNo})
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-700">{formatNPR(dep)}</td>
                    <td className="p-3 text-right font-mono text-rose-700">
                      {unp.gt(0) ? formatNPR(unp) : '—'}
                    </td>
                    <td className="p-3 text-right font-mono font-semibold">{formatNPR(base)}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-700">
                      {formatNPR(bns)}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {bnsOnUnpaid.gt(0) ? formatNPR(bnsOnUnpaid) : '—'}
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
