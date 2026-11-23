'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NepaliDatePicker } from '@/components/ui/nepali-date-picker';
import { approveLoanAction, updateLoanAction } from './actions';
import { CheckCircle2, Edit3, X, AlertCircle } from 'lucide-react';

export interface LoanApprovalData {
  id: string;
  loanNo: string;
  amount: number | string;
  rateAtStart?: number | string;
  purpose?: string | null;
  borrower?: {
    fullName: string;
    memberNo: string;
  };
}

export function ApproveLoanButton({
  loan,
  loanId,
}: {
  loan?: LoanApprovalData;
  loanId?: string;
}) {
  const actualId = loan?.id || loanId || '';
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(loan ? String(loan.amount) : '50000');
  const [rateAtStart, setRateAtStart] = useState(loan?.rateAtStart ? String(loan.rateAtStart) : '12');
  const [purpose, setPurpose] = useState(loan?.purpose || '');
  const [disbursementDate, setDisbursementDate] = useState<string>(() => new Date().toISOString());
  const [loading, setLoading] = useState(false);
  const [savingOnly, setSavingOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSaveChanges() {
    if (!amount || Number(amount) <= 0) {
      setError('Loan amount must be a positive number.');
      return;
    }
    setSavingOnly(true);
    setError(null);
    try {
      const res = await updateLoanAction({
        loanId: actualId,
        amount: parseFloat(amount),
        rateAtStart: parseFloat(rateAtStart) || 12,
        purpose,
      });
      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        window.location.reload();
      }
    } catch {
      setError('Failed to update loan information.');
    } finally {
      setSavingOnly(false);
    }
  }

  async function handleApproveAndDisburse() {
    if (!amount || Number(amount) <= 0) {
      setError('Loan amount must be a positive number.');
      return;
    }
    if (!confirm(`Are you sure you want to approve & disburse NPR ${Number(amount).toLocaleString()} for ${loan?.borrower?.fullName || 'this member'}? This will post the cash disbursement journal.`)) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await approveLoanAction({
        loanId: actualId,
        amount: parseFloat(amount),
        rateAtStart: parseFloat(rateAtStart) || 12,
        purpose,
        disbursementDate,
      });
      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        window.location.reload();
      }
    } catch {
      setError('Failed to approve and disburse loan.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 shadow-sm gap-1.5 cursor-pointer"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Review & Approve
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <Card className="w-full max-w-lg bg-card shadow-2xl flex flex-col overflow-visible text-left my-auto">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4 bg-muted/20">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-emerald-600" />
                  Review & Approve Loan {loan?.loanNo ? `(${loan.loanNo})` : ''}
                </CardTitle>
                {loan?.borrower && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Borrower: <strong className="text-foreground">{loan.borrower.fullName}</strong> ({loan.borrower.memberNo})
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <div className="p-5 space-y-4 overflow-visible">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-md p-2.5 text-xs text-amber-900 dark:text-amber-200">
                You can adjust loan amount, rate, and disbursement date before approving. Changes will be posted atomically to the journal.
              </div>

              {/* Loan Amount */}
              <div className="space-y-1">
                <label className="text-xs font-semibold">Approved Principal Amount (NPR) *</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-xs text-muted-foreground font-mono">Rs.</span>
                  <input
                    type="number"
                    step="any"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm font-mono font-bold"
                  />
                </div>
              </div>

              {/* Interest Rate */}
              <div className="space-y-1">
                <label className="text-xs font-semibold">Annual Interest Rate (%) *</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={rateAtStart}
                    onChange={(e) => setRateAtStart(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono"
                  />
                  <span className="absolute right-3 top-2 text-xs text-muted-foreground">%</span>
                </div>
              </div>

              {/* Disbursement Date */}
              <div className="space-y-1 relative z-30">
                <NepaliDatePicker
                  name="disbursementDate"
                  label="Disbursement Date (BS)"
                  value={disbursementDate}
                  onChange={(iso) => setDisbursementDate(iso)}
                  popoverAlign="left"
                />
              </div>

              {/* Purpose */}
              <div className="space-y-1">
                <label className="text-xs font-semibold">Loan Purpose / Remarks</label>
                <input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Agriculture, Business expansion"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>

            <CardFooter className="border-t p-4 flex flex-wrap items-center justify-between gap-2 bg-muted/10">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={loading || savingOnly}
              >
                Cancel
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSaveChanges}
                  disabled={loading || savingOnly}
                >
                  {savingOnly ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApproveAndDisburse}
                  disabled={loading || savingOnly}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  {loading ? 'Disbursing...' : 'Approve & Disburse'}
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      )}
    </>
  );
}
