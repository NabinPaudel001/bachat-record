import { prisma } from '@/server/db';
import { requireRole } from '@/server/auth/rbac';
import { getAllSettings, updateSetting } from '@/server/settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import Decimal from 'decimal.js';

export const runtime = 'nodejs';

export default async function SettingsPage() {
  await requireRole(Role.ADMIN);

  const settings = await getAllSettings();
  const rates = await prisma.rateHistory.findMany({
    orderBy: { effectiveFrom: 'desc' },
  });

  async function updateSettingAction(formData: FormData) {
    'use server';
    await requireRole(Role.ADMIN);

    const contributionFine = Number(formData.get('contributionFine'));
    const loanInterestFine = Number(formData.get('loanInterestFine'));
    const contributionGraceDay = Number(formData.get('contributionGraceDay'));
    const loanInterestGraceDay = Number(formData.get('loanInterestGraceDay'));
    const bonusIncludesUnpaid = formData.get('bonusIncludesUnpaid') === 'true';
    const allowReserveDraw = formData.get('allowReserveDraw') === 'true';
    const helperNeedApproval = formData.get('helperPaymentsNeedApproval') === 'true';

    await updateSetting('contributionFine', new Decimal(contributionFine));
    await updateSetting('loanInterestFine', new Decimal(loanInterestFine));
    await updateSetting('contributionGraceDay', contributionGraceDay);
    await updateSetting('loanInterestGraceDay', loanInterestGraceDay);
    await updateSetting('bonusIncludesUnpaid', bonusIncludesUnpaid);
    await updateSetting('allowReserveDraw', allowReserveDraw);
    await updateSetting('helperPaymentsNeedApproval', helperNeedApproval);

    revalidatePath('/settings');
  }

  async function addRateAction(formData: FormData) {
    'use server';
    const user = await requireRole(Role.ADMIN);
    const type = formData.get('type') as 'SAVINGS' | 'LOAN';
    const ratePercent = Number(formData.get('ratePercent'));
    const effectiveFrom = new Date(formData.get('effectiveFrom') as string);
    const reason = formData.get('reason') as string;

    await prisma.rateHistory.create({
      data: {
        type,
        ratePercent: new Decimal(ratePercent),
        effectiveFrom,
        reason,
        createdById: user.id,
      },
    });

    revalidatePath('/settings');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure business rules, interest rate history, fines, and grace periods
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Financial Settings */}
        <Card>
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-base">Business Rules & Defaults</CardTitle>
          </CardHeader>
          <form action={updateSettingAction}>
            <CardContent className="p-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Contribution Fine (NPR)</label>
                  <input
                    type="number"
                    name="contributionFine"
                    defaultValue={settings.contributionFine.toString()}
                    className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Loan Interest Fine (NPR)</label>
                  <input
                    type="number"
                    name="loanInterestFine"
                    defaultValue={settings.loanInterestFine.toString()}
                    className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Contribution Grace Day</label>
                  <input
                    type="number"
                    name="contributionGraceDay"
                    defaultValue={settings.contributionGraceDay.toString()}
                    className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Loan Grace Day</label>
                  <input
                    type="number"
                    name="loanInterestGraceDay"
                    defaultValue={settings.loanInterestGraceDay.toString()}
                    className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="bonusIncludesUnpaid"
                    name="bonusIncludesUnpaid"
                    value="true"
                    defaultChecked={settings.bonusIncludesUnpaid}
                    className="h-4 w-4 rounded"
                  />
                  <label htmlFor="bonusIncludesUnpaid" className="text-xs font-medium">
                    Bonus base includes unpaid dues (Section 3.9)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allowReserveDraw"
                    name="allowReserveDraw"
                    value="true"
                    defaultChecked={settings.allowReserveDraw}
                    className="h-4 w-4 rounded"
                  />
                  <label htmlFor="allowReserveDraw" className="text-xs font-medium">
                    Allow bonus payout to draw from reserve
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="helperPaymentsNeedApproval"
                    name="helperPaymentsNeedApproval"
                    value="true"
                    defaultChecked={settings.helperPaymentsNeedApproval}
                    className="h-4 w-4 rounded"
                  />
                  <label htmlFor="helperPaymentsNeedApproval" className="text-xs font-medium">
                    Maker-Checker: Helper payments require approval
                  </label>
                </div>
              </div>

              <Button type="submit" className="w-full">
                Save Settings
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* Global Floating Rate Management */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-base">Set New Global Rate</CardTitle>
            </CardHeader>
            <form action={addRateAction}>
              <CardContent className="p-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Rate Type *</label>
                    <select
                      name="type"
                      className="h-9 w-full rounded border bg-background px-3 text-sm"
                    >
                      <option value="SAVINGS">Savings Interest Rate</option>
                      <option value="LOAN">Loan Interest Rate</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Rate Percent (% p.a.) *</label>
                    <input
                      type="number"
                      step="0.01"
                      name="ratePercent"
                      required
                      placeholder="e.g. 12.00"
                      className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Effective From Date *</label>
                  <input
                    type="date"
                    name="effectiveFrom"
                    required
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="h-9 w-full rounded border bg-background px-3 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Meeting Resolution / Reason</label>
                  <input
                    name="reason"
                    placeholder="e.g. Annual General Meeting rate revision"
                    className="h-9 w-full rounded border bg-background px-3 text-sm"
                  />
                </div>

                <Button type="submit" className="w-full">
                  Post New Rate to History
                </Button>
              </CardContent>
            </form>
          </Card>

          {/* Rate History Table */}
          <Card>
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-sm font-semibold">Rate History ({rates.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 border-b uppercase">
                  <tr>
                    <th className="p-2">Type</th>
                    <th className="p-2">Rate</th>
                    <th className="p-2">Effective From</th>
                    <th className="p-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rates.map((r) => (
                    <tr key={r.id}>
                      <td className="p-2">
                        <Badge variant="outline">{r.type}</Badge>
                      </td>
                      <td className="p-2 font-mono font-bold text-primary">
                        {r.ratePercent.toString()}%
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {r.effectiveFrom.toISOString().split('T')[0]}
                      </td>
                      <td className="p-2 text-muted-foreground">{r.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
