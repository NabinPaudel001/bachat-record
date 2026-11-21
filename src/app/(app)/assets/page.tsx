import { prisma } from '@/server/db';
import { formatNPR } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { requireRole } from '@/server/auth/rbac';
import { revalidatePath } from 'next/cache';
import { Role } from '@prisma/client';
import Decimal from 'decimal.js';

export const runtime = 'nodejs';

export default async function OtherAssetsPage() {
  await requireRole(Role.ADMIN, Role.TREASURER);

  const assets = await prisma.otherAsset.findMany({
    orderBy: { acquiredOn: 'desc' },
  });

  async function addOtherAssetAction(formData: FormData) {
    'use server';
    await requireRole(Role.ADMIN, Role.TREASURER);
    const name = formData.get('name') as string;
    const cost = Number(formData.get('cost'));
    const acquiredOn = new Date(formData.get('acquiredOn') as string);
    const notes = formData.get('notes') as string;

    if (!name || cost <= 0) return;

    await prisma.otherAsset.create({
      data: {
        name,
        cost: new Decimal(cost),
        currentValue: new Decimal(cost),
        acquiredOn,
        notes,
      },
    });

    revalidatePath('/assets');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Other Physical Assets</h1>
        <p className="text-sm text-muted-foreground">
          Office equipment, computers, safes, furniture, and fixed assets
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Add Form */}
        <Card className="md:col-span-1">
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-sm font-semibold">Add Holding Asset</CardTitle>
          </CardHeader>
          <form action={addOtherAssetAction}>
            <CardContent className="p-4 space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Asset Name *</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Office Safe, Laptop"
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Cost (NPR) *</label>
                <input
                  type="number"
                  name="cost"
                  required
                  min="1"
                  placeholder="e.g. 45000"
                  className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Acquired Date *</label>
                <input
                  type="date"
                  name="acquiredOn"
                  required
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Notes / Location</label>
                <input
                  name="notes"
                  placeholder="Optional details"
                  className="h-9 w-full rounded border bg-background px-3 text-sm"
                />
              </div>
              <Button type="submit" className="w-full">
                Add Asset
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* List Table */}
        <Card className="md:col-span-2">
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-sm font-semibold">Registered Assets ({assets.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="p-3">Asset</th>
                  <th className="p-3">Acquired On</th>
                  <th className="p-3 text-right">Cost</th>
                  <th className="p-3 text-right">Current Value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {assets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      No assets recorded.
                    </td>
                  </tr>
                ) : (
                  assets.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/20">
                      <td className="p-3">
                        <span className="font-medium">{a.name}</span>
                        {a.notes && <span className="block text-xs text-muted-foreground">{a.notes}</span>}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {a.acquiredOn.toISOString().split('T')[0]}
                      </td>
                      <td className="p-3 text-right font-mono">{formatNPR(a.cost.toString())}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600">
                        {formatNPR(a.currentValue.toString())}
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
