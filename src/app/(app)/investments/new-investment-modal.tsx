'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Plus, X } from 'lucide-react';
import { buyInvestmentAction } from './actions';

export function NewInvestmentModal({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [name, setName] = useState('');
  const [units, setUnits] = useState('');
  const [cost, setCost] = useState('100000');
  const [buyDate, setBuyDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await buyInvestmentAction({
        categoryId,
        name,
        units: units ? Number(units) : undefined,
        cost: Number(cost),
        buyDate: buyDate || new Date().toISOString(),
        notes,
      });

      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        window.location.reload();
      }
    } catch {
      setError('Failed to record investment purchase.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="flex items-center gap-1.5 shadow-sm">
        <Plus className="h-4 w-4" /> Buy Investment
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <Card className="w-full max-w-md bg-card shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4">
              <CardTitle className="text-base">Record Investment Purchase</CardTitle>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="p-4 space-y-4 text-sm">
                {error && (
                  <div className="rounded bg-destructive/10 p-2 text-destructive text-xs">
                    {error}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Category *</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="h-9 w-full rounded border bg-background px-3 text-sm"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Asset Name / Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 5 Tola Gold Bullion, Plot 42 Land"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-9 w-full rounded border bg-background px-3 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Total Cost (NPR) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="500"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Units / Quantity</label>
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="e.g. 100 shares"
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                      className="h-9 w-full rounded border bg-background px-3 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Purchase Date *</label>
                  <input
                    type="date"
                    required
                    value={buyDate}
                    onChange={(e) => setBuyDate(e.target.value)}
                    className="h-9 w-full rounded border bg-background px-3 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Notes / Location / Broker</label>
                  <input
                    type="text"
                    placeholder="Optional details"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-9 w-full rounded border bg-background px-3 text-sm"
                  />
                </div>
              </CardContent>

              <CardFooter className="p-4 border-t flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Recording...' : 'Record Purchase & Post Journal'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
