'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { waiveFineAction } from './actions';
import { formatNPR } from '@/lib/format';
import { X, ShieldAlert } from 'lucide-react';

export function WaiveFineModal({
  fineId,
  memberInfo,
  remainingAmount,
}: {
  fineId: string;
  memberInfo: string;
  remainingAmount: number;
}) {
  const [open, setOpen] = useState(false);
  const [waiveAmount, setWaiveAmount] = useState(remainingAmount.toString());
  const [reason, setReason] = useState('Medical emergency / compassionate waiver approved by group admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWaive(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await waiveFineAction({
        fineId,
        waiveAmount: Number(waiveAmount),
        reason,
      });

      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        window.location.reload();
      }
    } catch {
      setError('Failed to waive fine.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-7 text-xs border-orange-400 text-orange-700 hover:bg-orange-50"
      >
        Waive
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md bg-card shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-orange-600" /> Waive Fine Penalty
              </CardTitle>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <form onSubmit={handleWaive}>
              <CardContent className="p-4 space-y-4 text-sm">
                {error && (
                  <div className="rounded bg-destructive/10 p-3 text-destructive text-xs">
                    {error}
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  Member: <strong className="text-foreground">{memberInfo}</strong>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Waive Amount (NPR) *</label>
                  <input
                    type="number"
                    max={remainingAmount}
                    min="1"
                    step="10"
                    required
                    value={waiveAmount}
                    onChange={(e) => setWaiveAmount(e.target.value)}
                    className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Remaining unpaid balance: {formatNPR(remainingAmount)}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Mandatory Admin Waiver Reason *</label>
                  <textarea
                    required
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded border bg-background p-2 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Note: Waived fines post no accounting journal (income is recognized only on cash collection).
                  </p>
                </div>
              </CardContent>

              <CardFooter className="p-4 border-t flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="bg-orange-600 hover:bg-orange-700">
                  {loading ? 'Waiving...' : 'Confirm Waiver'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
