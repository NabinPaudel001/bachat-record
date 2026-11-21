import { prisma } from '@/server/db';
import { formatNPR } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Decimal from 'decimal.js';
import { NewInvestmentModal } from './new-investment-modal';
import { AddCategoryModal } from './add-category-modal';

export const runtime = 'nodejs';

export default async function InvestmentsPage() {
  const categories = await prisma.investmentCategory.findMany({
    where: { active: true },
    include: {
      investments: true,
    },
    orderBy: { sortOrder: 'asc' },
  });

  const allInvestments = await prisma.investment.findMany({
    include: { category: true },
    orderBy: { buyDate: 'desc' },
  });

  let totalCostAll = new Decimal(0);
  let totalCurrentValAll = new Decimal(0);

  for (const inv of allInvestments) {
    if (inv.status === 'ACTIVE') {
      totalCostAll = totalCostAll.plus(new Decimal(inv.cost.toString()));
      totalCurrentValAll = totalCurrentValAll.plus(new Decimal(inv.currentValue.toString()));
    }
  }

  const unrealizedGainAll = totalCurrentValAll.minus(totalCostAll);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Investments Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            Track pooled savings invested in Gold, Land, Stocks, and Promoter Shares
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddCategoryModal />
          <NewInvestmentModal categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
        </div>
      </div>

      {/* Portfolio Overall Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Total Invested Cost</div>
          <div className="text-2xl font-bold mt-1 font-mono">{formatNPR(totalCostAll)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Current Valuation</div>
          <div className="text-2xl font-bold mt-1 font-mono text-emerald-600">
            {formatNPR(totalCurrentValAll)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Unrealized Gain / Loss</div>
          <div
            className={`text-2xl font-bold mt-1 font-mono ${
              unrealizedGainAll.gte(0) ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {unrealizedGainAll.gte(0) ? '+' : ''}
            {formatNPR(unrealizedGainAll)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Note: Unrealized gains are never distributable
          </div>
        </Card>
      </div>

      {/* Category Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {categories.map((c) => {
          let catVal = new Decimal(0);
          for (const i of c.investments) {
            if (i.status === 'ACTIVE') {
              catVal = catVal.plus(new Decimal(i.currentValue.toString()));
            }
          }
          return (
            <Card key={c.id} className="p-3">
              <div className="text-xs font-semibold text-muted-foreground truncate">{c.name}</div>
              <div className="text-lg font-bold font-mono mt-1">{formatNPR(catVal)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {c.investments.filter((i) => i.status === 'ACTIVE').length} holdings
              </div>
            </Card>
          );
        })}
      </div>

      {/* Holdings Table */}
      <Card>
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-base">Asset Holdings</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
              <tr>
                <th className="p-3">Asset Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Buy Date</th>
                <th className="p-3 text-right">Units / Quantity</th>
                <th className="p-3 text-right">Cost (NPR)</th>
                <th className="p-3 text-right">Current Valuation</th>
                <th className="p-3 text-right">Gain / Loss</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {allInvestments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No investment holdings yet. Click &quot;Add Investment&quot; to buy assets.
                  </td>
                </tr>
              ) : (
                allInvestments.map((inv) => {
                  const cost = Number(inv.cost);
                  const val = Number(inv.currentValue);
                  const diff = val - cost;
                  return (
                    <tr key={inv.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">
                        {inv.name}
                        {inv.notes && (
                          <span className="block text-xs text-muted-foreground">{inv.notes}</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">{inv.category.name}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {inv.buyDate.toISOString().split('T')[0]}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {inv.units ? inv.units.toString() : '—'}
                      </td>
                      <td className="p-3 text-right font-mono">{formatNPR(cost)}</td>
                      <td className="p-3 text-right font-mono font-semibold text-emerald-600">
                        {formatNPR(val)}
                      </td>
                      <td
                        className={`p-3 text-right font-mono font-bold ${
                          diff >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {diff >= 0 ? '+' : ''}
                        {formatNPR(diff)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          variant={inv.status === 'ACTIVE' ? 'success' : 'secondary'}
                          className="text-[10px]"
                        >
                          {inv.status}
                        </Badge>
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
