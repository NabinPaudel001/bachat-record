import { prisma } from '@/server/db';
import { formatNPR } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { recordExpenseAction, recordIncomeAction } from './actions';
import { Button } from '@/components/ui/button';

export const runtime = 'nodejs';

export default async function ExpensesPage() {
  const expenses = await prisma.expense.findMany({
    orderBy: { date: 'desc' },
    take: 20,
  });

  const otherIncomes = await prisma.otherIncome.findMany({
    orderBy: { date: 'desc' },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expenses & Miscellaneous Income</h1>
        <p className="text-sm text-muted-foreground">
          Record operational costs and miscellaneous non-member revenues
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Record Expense Form */}
        <Card>
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-base text-rose-700">Record Operating Expense</CardTitle>
          </CardHeader>
          <form
            action={async (formData: FormData) => {
              'use server';
              await recordExpenseAction(formData);
            }}
          >
            <CardContent className="p-4 space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Expense Date *</label>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Amount (NPR) *</label>
                <input
                  type="number"
                  name="amount"
                  min="1"
                  required
                  placeholder="e.g. 2500"
                  className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Payee / Vendor</label>
                <input
                  type="text"
                  name="payee"
                  placeholder="e.g. Stationery Store, Tea Shop"
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Description / Note</label>
                <input
                  type="text"
                  name="note"
                  placeholder="e.g. Meeting snacks and register books"
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                />
              </div>
              <Button type="submit" className="w-full bg-rose-600 hover:bg-rose-700">
                Post Expense & Cash Journal
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* Record Income Form */}
        <Card>
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-base text-emerald-700">Record Miscellaneous Income</CardTitle>
          </CardHeader>
          <form
            action={async (formData: FormData) => {
              'use server';
              await recordIncomeAction(formData);
            }}
          >
            <CardContent className="p-4 space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Income Date *</label>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Amount (NPR) *</label>
                <input
                  type="number"
                  name="amount"
                  min="1"
                  required
                  placeholder="e.g. 5000"
                  className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Source / Donor</label>
                <input
                  type="text"
                  name="source"
                  placeholder="e.g. Bank Interest, Donation"
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Description / Note</label>
                <input
                  type="text"
                  name="note"
                  placeholder="e.g. Savings account quarterly credit"
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                />
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
                Post Income & Cash Journal
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>

      {/* Recent Log */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-sm">Recent Expenses</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Payee / Note</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-muted-foreground">
                      No expenses recorded yet.
                    </td>
                  </tr>
                ) : (
                  expenses.map((e) => (
                    <tr key={e.id}>
                      <td className="p-2 text-muted-foreground">
                        {e.date.toISOString().split('T')[0]}
                      </td>
                      <td className="p-2">
                        <span className="font-medium">{e.payee || 'Expense'}</span>
                        {e.note && <span className="block text-muted-foreground">{e.note}</span>}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-rose-700">
                        {formatNPR(e.amount.toString())}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-sm">Recent Income</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Source / Note</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {otherIncomes.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-muted-foreground">
                      No income recorded yet.
                    </td>
                  </tr>
                ) : (
                  otherIncomes.map((i) => (
                    <tr key={i.id}>
                      <td className="p-2 text-muted-foreground">
                        {i.date.toISOString().split('T')[0]}
                      </td>
                      <td className="p-2">
                        <span className="font-medium">{i.source || 'Other Income'}</span>
                        {i.note && <span className="block text-muted-foreground">{i.note}</span>}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-emerald-700">
                        {formatNPR(i.amount.toString())}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
