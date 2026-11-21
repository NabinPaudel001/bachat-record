'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { capitaliseInterestAction } from './actions';
import { formatNPR } from '@/lib/format';
import { X, TrendingUp } from 'lucide-react';

export function CapitaliseModal({
  loanId,
  loanNo,
  totalUnpaidInterest,
}: {
  loanId: string;
  loanNo: string;
  totalUnpaidInterest: number;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(totalUnpaidInterest.toString());
  const [reason, setReason] = useState('Quarterly interest capitalisation per loan agreement');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCapitalise(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await capitaliseInterestAction({
        loanId,
        amount: Number(amount),
        reason,
      });

      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        window.location.reload();
      }
    } catch {
      setError('Failed to capitalise interest.');
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
        className="flex items-center gap-1.5 border-amber-500 text-amber-700 hover:bg-amber-50 shadow-sm"
      >
        <TrendingUp className="h-4 w-4" /> Capitalise Interest
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md bg-card shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4">
              <CardTitle className="text-base">Capitalise Interest to Principal</CardTitle>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <form onSubmit={handleCapitalise}>
              <CardContent className="p-4 space-y-4 text-sm">
                {error && (
                  <div className="rounded bg-destructive/10 p-3 text-destructive text-xs">
                    {error}
                  </div>
                )}

                <div className="p-3 bg-amber-50 rounded border border-amber-200 text-amber-900 text-xs space-y-1">
                  <p className="font-semibold">Effect on Loan {loanNo}:</p>
                  <p>• Principal outstanding will increase by {formatNPR(amount || 0)}</p>
                  <p>• Unpaid accrued interest will decrease by {formatNPR(amount || 0)}</p>
                  <p>• From today onward, interest will accrue on the new increased principal</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Amount to Convert (NPR) *</label>
                  <input
                    type="number"
                    max={totalUnpaidInterest}
                    min="1"
                    step="50"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Max available unpaid interest: {formatNPR(totalUnpaidInterest)}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Mandatory Admin Reason *</label>
                  <textarea
                    required
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded border bg-background p-2 text-sm"
                  />
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
                <Button type="submit" disabled={loading} className="bg-amber-600 hover:bg-amber-700">
                  {loading ? 'Capitalising...' : 'Confirm Capitalisation'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
