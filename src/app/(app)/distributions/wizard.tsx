'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Plus, X, ArrowRight } from 'lucide-react';
import { confirmDistributionAction } from './actions';

export function CreateDistributionWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [type, setType] = useState<'INTEREST' | 'BONUS'>('BONUS');
  const [period, setPeriod] = useState<'ANNUAL' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'MONTHLY'>('ANNUAL');
  const [totalAmount, setTotalAmount] = useState('75000');
  const [payoutMode, setPayoutMode] = useState<'PAYABLE' | 'REINVEST'>('PAYABLE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await confirmDistributionAction({
        type,
        period,
        fromDate: new Date('2024-04-14').toISOString(),
        toDate: new Date().toISOString(),
        totalAmount: Number(totalAmount),
        payoutMode,
      });

      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        window.location.reload();
      }
    } catch {
      setError('Failed to confirm distribution.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="flex items-center gap-1.5 shadow-sm">
        <Plus className="h-4 w-4" /> Run Distribution Run
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg bg-card shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4">
              <CardTitle className="text-base">Distribution Wizard (Step {step} of 2)</CardTitle>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <CardContent className="p-4 space-y-4 text-sm">
              {error && (
                <div className="rounded bg-destructive/10 p-2 text-destructive text-xs">
                  {error}
                </div>
              )}

              {step === 1 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Distribution Type *</label>
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value as 'INTEREST' | 'BONUS')}
                        className="h-9 w-full rounded border bg-background px-3 text-sm"
                      >
                        <option value="BONUS">Annual Group Bonus</option>
                        <option value="INTEREST">Savings Interest</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Frequency / Period *</label>
                      <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value as 'ANNUAL' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'MONTHLY')}
                        className="h-9 w-full rounded border bg-background px-3 text-sm"
                      >
                        <option value="ANNUAL">Annual</option>
                        <option value="SEMI_ANNUAL">Semi-Annual</option>
                        <option value="QUARTERLY">Quarterly</option>
                        <option value="MONTHLY">Monthly</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Total Amount to Distribute (NPR) *</label>
                    <input
                      type="number"
                      required
                      min="1000"
                      step="500"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Credit Payout Mode *</label>
                    <select
                      value={payoutMode}
                      onChange={(e) => setPayoutMode(e.target.value as 'PAYABLE' | 'REINVEST')}
                      className="h-9 w-full rounded border bg-background px-3 text-sm"
                    >
                      <option value="PAYABLE">PAYABLE (Payable to member, credit account 2100)</option>
                      <option value="REINVEST">REINVEST (Add to member deposit balance, credit 2000)</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-muted/40 rounded space-y-1 text-xs">
                    <p>
                      <strong>Distribution Type:</strong> {type} ({period})
                    </p>
                    <p>
                      <strong>Total Pool:</strong> NPR {Number(totalAmount).toLocaleString()}
                    </p>
                    <p>
                      <strong>Payout Mode:</strong> {payoutMode}
                    </p>
                    <p className="text-muted-foreground pt-1">
                      Lines will be allocated proportionally to member bases. Any rounding paisa difference is assigned to the largest member line so the total sums with 100% precision.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="p-4 border-t flex justify-between">
              {step === 1 ? (
                <>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setStep(2)} className="flex items-center gap-1">
                    Next: Review & Confirm <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setStep(1)} disabled={loading}>
                    Back
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {loading ? 'Confirming...' : 'Confirm & Post to Books'}
                  </Button>
                </>
              )}
            </CardFooter>
          </Card>
        </div>
      )}
    </>
  );
}
