import { getBalanceSheet, getProfitAndLoss, getCashFlow } from '@/server/services/reportService';
import { formatNPR } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { ReportExportButton } from '@/components/ui/print-button';

export const runtime = 'nodejs';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; asOf?: string; from?: string; to?: string }>;
}) {
  const { tab = 'balance-sheet', asOf, from, to } = await searchParams;

  const asOfDate = asOf ? new Date(asOf) : new Date();
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
  const toDate = to ? new Date(to) : new Date();

  const balanceSheet = await getBalanceSheet(asOfDate);
  const pnl = await getProfitAndLoss(fromDate, toDate);
  const cashFlow = await getCashFlow(fromDate, toDate);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Statements & Reports</h1>
          <p className="text-sm text-muted-foreground">
            Strict double-entry accounting statements conforming to Section 8
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ReportExportButton />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-6 text-sm font-medium">
        <Link
          href="/reports?tab=balance-sheet"
          className={`pb-2 border-b-2 transition-colors ${
            tab === 'balance-sheet'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Balance Sheet
        </Link>
        <Link
          href="/reports?tab=pnl"
          className={`pb-2 border-b-2 transition-colors ${
            tab === 'pnl'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Profit & Loss (P&L)
        </Link>
        <Link
          href="/reports?tab=cash-flow"
          className={`pb-2 border-b-2 transition-colors ${
            tab === 'cash-flow'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Cash Flow Statement
        </Link>
      </div>

      {/* TAB 1: Balance Sheet */}
      {tab === 'balance-sheet' && (
        <div className="space-y-6">
          {/* Balance Integrity Banner */}
          <div
            className={`p-4 rounded-lg border flex items-center justify-between text-sm ${
              balanceSheet.isBalanced
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {balanceSheet.isBalanced ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              )}
              <span className="font-semibold">
                {balanceSheet.isBalanced
                  ? 'Double-Entry Balanced: Total Assets = Total Liabilities + Equity'
                  : 'Imbalance Error: Total Assets does not equal Liabilities + Equity!'}
              </span>
            </div>
            <div className="font-mono text-xs">
              Assets: {formatNPR(balanceSheet.totalAssets)} • L+E: {formatNPR(balanceSheet.totalLiabilitiesAndEquity)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Assets */}
            <Card>
              <CardHeader className="p-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold flex justify-between items-center">
                  <span>Assets (1xxx)</span>
                  <span className="font-mono text-emerald-700">
                    {formatNPR(balanceSheet.totalAssets)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-xs text-left">
                  <tbody className="divide-y">
                    {balanceSheet.assets.map((a) => (
                      <tr key={a.code} className="hover:bg-muted/10">
                        <td className="p-3 font-mono text-muted-foreground">{a.code}</td>
                        <td className="p-3 font-medium">{a.name}</td>
                        <td className="p-3 text-right font-mono font-semibold">
                          {formatNPR(a.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Liabilities & Equity */}
            <div className="space-y-6">
              <Card>
                <CardHeader className="p-4 border-b bg-muted/20">
                  <CardTitle className="text-sm font-bold flex justify-between items-center">
                    <span>Liabilities (2xxx)</span>
                    <span className="font-mono text-amber-700">
                      {formatNPR(balanceSheet.totalLiabilities)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-xs text-left">
                    <tbody className="divide-y">
                      {balanceSheet.liabilities.map((l) => (
                        <tr key={l.code} className="hover:bg-muted/10">
                          <td className="p-3 font-mono text-muted-foreground">{l.code}</td>
                          <td className="p-3 font-medium">{l.name}</td>
                          <td className="p-3 text-right font-mono font-semibold">
                            {formatNPR(l.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 border-b bg-muted/20">
                  <CardTitle className="text-sm font-bold flex justify-between items-center">
                    <span>Equity & Retained Surplus (3xxx)</span>
                    <span className="font-mono text-indigo-700">
                      {formatNPR(balanceSheet.totalEquity)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-xs text-left">
                    <tbody className="divide-y">
                      {balanceSheet.equity.map((e) => (
                        <tr key={e.code} className="hover:bg-muted/10">
                          <td className="p-3 font-mono text-muted-foreground">{e.code}</td>
                          <td className="p-3 font-medium">{e.name}</td>
                          <td className="p-3 text-right font-mono font-semibold">
                            {formatNPR(e.balance)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-indigo-50/50">
                        <td className="p-3 font-mono text-muted-foreground">SURPLUS</td>
                        <td className="p-3 font-medium text-indigo-950">Current Cumulative Net Surplus</td>
                        <td className="p-3 text-right font-mono font-bold text-indigo-700">
                          {formatNPR(balanceSheet.netSurplus)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Below The Line (Memo Items) */}
          <Card className="border-dashed bg-muted/10">
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                Below the Line: Memo Receivables & Unrealized Values (Section 8)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-card border rounded">
                <span className="text-muted-foreground block">Memo: Pending Member Contributions</span>
                <span className="text-base font-bold font-mono mt-1 block text-rose-600">
                  {formatNPR(balanceSheet.memoReceivables.pendingContributions)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Scheduled dues not yet paid in cash
                </span>
              </div>

              <div className="p-3 bg-card border rounded">
                <span className="text-muted-foreground block">Memo: Uncollected Penalty Fines</span>
                <span className="text-base font-bold font-mono mt-1 block text-orange-600">
                  {formatNPR(balanceSheet.memoReceivables.pendingFines)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Recognized as income only upon cash receipt
                </span>
              </div>

              <div className="p-3 bg-card border rounded">
                <span className="text-muted-foreground block">Memo: Unrealized Investment Gain</span>
                <span className="text-base font-bold font-mono mt-1 block text-emerald-600">
                  {formatNPR(balanceSheet.unrealizedInvestmentGain)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Property/stock appreciation (not distributable)
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: P&L */}
      {tab === 'pnl' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Income */}
            <Card>
              <CardHeader className="p-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold flex justify-between items-center text-emerald-800">
                  <span>Operating & Financial Income (4xxx)</span>
                  <span className="font-mono">{formatNPR(pnl.totalIncome)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-xs text-left">
                  <tbody className="divide-y">
                    {pnl.income.map((i) => (
                      <tr key={i.code}>
                        <td className="p-3 font-mono text-muted-foreground">{i.code}</td>
                        <td className="p-3 font-medium">{i.name}</td>
                        <td className="p-3 text-right font-mono font-semibold text-emerald-700">
                          {formatNPR(i.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Expenses */}
            <Card>
              <CardHeader className="p-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold flex justify-between items-center text-rose-800">
                  <span>Expenses (5100, 5200)</span>
                  <span className="font-mono">{formatNPR(pnl.totalExpenses)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-xs text-left">
                  <tbody className="divide-y">
                    {pnl.expenses.map((e) => (
                      <tr key={e.code}>
                        <td className="p-3 font-mono text-muted-foreground">{e.code}</td>
                        <td className="p-3 font-medium">{e.name}</td>
                        <td className="p-3 text-right font-mono font-semibold text-rose-700">
                          {formatNPR(e.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <Card className="p-4 bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-xs uppercase text-muted-foreground font-semibold block">
                Net Operating Surplus
              </span>
              <span className="text-2xl font-bold font-mono text-emerald-700">
                {formatNPR(pnl.operatingSurplus)}
              </span>
            </div>
            <div>
              <span className="text-xs uppercase text-muted-foreground font-semibold block">
                Member Appropriations (5000)
              </span>
              <span className="text-xl font-bold font-mono text-indigo-700">
                {formatNPR(pnl.totalAppropriations)}
              </span>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: Cash Flow Statement */}
      {tab === 'cash-flow' && (
        <Card>
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-base">
              Statement of Cash Flows (Direct Method — Section 8)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4 text-sm max-w-2xl">
            <div className="flex justify-between py-2 border-b">
              <span className="font-medium">Opening Cash and Bank (1000)</span>
              <span className="font-mono font-bold">{formatNPR(cashFlow.openingCash)}</span>
            </div>

            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground pl-4">Operating Cash Flows (Interest, Fines, Expenses)</span>
              <span className="font-mono text-emerald-700">{formatNPR(cashFlow.operatingCashFlow)}</span>
            </div>

            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground pl-4">Investing Cash Flows (Loans Disbursed/Repaid, Investments)</span>
              <span className="font-mono text-blue-700">{formatNPR(cashFlow.investingCashFlow)}</span>
            </div>

            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground pl-4">Financing Cash Flows (Member Contributions, Exits)</span>
              <span className="font-mono text-indigo-700">{formatNPR(cashFlow.financingCashFlow)}</span>
            </div>

            <div className="flex justify-between py-2 border-b font-semibold bg-muted/20 px-2 rounded">
              <span>Net Change in Cash</span>
              <span className="font-mono">{formatNPR(cashFlow.netCashChange)}</span>
            </div>

            <div className="flex justify-between py-3 border-t-2 border-foreground font-bold text-base bg-emerald-50/50 px-2 rounded">
              <span>Closing Cash and Bank (1000)</span>
              <span className="font-mono text-emerald-700">{formatNPR(cashFlow.closingCash)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
