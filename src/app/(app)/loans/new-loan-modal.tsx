'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Plus, X, AlertCircle } from 'lucide-react';
import { proposeLoanAction } from './actions';

export function NewLoanModal({
  activeMembers,
}: {
  activeMembers: { id: string; memberNo: string; fullName: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [borrowerId, setBorrowerId] = useState(activeMembers[0]?.id ?? '');
  const [amount, setAmount] = useState('50000');
  const [purpose, setPurpose] = useState('');
  const [g1, setG1] = useState(activeMembers[1]?.id ?? '');
  const [g2, setG2] = useState(activeMembers[2]?.id ?? '');
  const [g3, setG3] = useState(activeMembers[3]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guarantors = [g1, g2, g3];
  const uniqueGuarantors = new Set(guarantors);
  const hasDuplicates = uniqueGuarantors.size !== 3;
  const borrowerIsGuarantor = uniqueGuarantors.has(borrowerId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasDuplicates) {
      setError('All 3 guarantors must be distinct members.');
      return;
    }
    if (borrowerIsGuarantor) {
      setError('Borrower cannot be a guarantor for their own loan.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await proposeLoanAction({
        borrowerId,
        amount: Number(amount),
        purpose,
        guarantorMemberIds: [g1, g2, g3],
      });

      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        window.location.reload();
      }
    } catch {
      setError('An error occurred while creating loan application.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="flex items-center gap-1.5 shadow-sm">
        <Plus className="h-4 w-4" /> Propose New Loan
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <Card className="w-full max-w-lg bg-card shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4">
              <CardTitle className="text-lg">Propose Member Loan</CardTitle>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="p-4 space-y-4 text-sm">
                {error && (
                  <div className="rounded bg-destructive/10 p-3 text-destructive text-xs">
                    {error}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Borrower (Active Member) *</label>
                  <select
                    value={borrowerId}
                    onChange={(e) => setBorrowerId(e.target.value)}
                    className="h-9 w-full rounded border bg-background px-3 text-sm"
                  >
                    {activeMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.memberNo} — {m.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Loan Principal Amount (NPR) *</label>
                    <input
                      type="number"
                      required
                      min="1000"
                      step="500"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="h-9 w-full rounded border bg-background px-3 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Purpose</label>
                    <input
                      type="text"
                      placeholder="e.g. Agriculture, Business"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      className="h-9 w-full rounded border bg-background px-3 text-sm"
                    />
                  </div>
                </div>

                {/* 3 Guarantors Section */}
                <div className="border-t pt-4 space-y-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase text-foreground">
                      Exactly 3 Guarantors Required *
                    </h4>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <AlertCircle className="h-3 w-3 text-blue-600" />
                      Guarantor (reference only) — Not liable for borrower default
                    </p>
                  </div>

                  <div className="space-y-2">
                    <select
                      value={g1}
                      onChange={(e) => setG1(e.target.value)}
                      className="h-9 w-full rounded border bg-background px-3 text-xs"
                    >
                      {activeMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          Guarantor 1: {m.memberNo} — {m.fullName}
                        </option>
                      ))}
                    </select>

                    <select
                      value={g2}
                      onChange={(e) => setG2(e.target.value)}
                      className="h-9 w-full rounded border bg-background px-3 text-xs"
                    >
                      {activeMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          Guarantor 2: {m.memberNo} — {m.fullName}
                        </option>
                      ))}
                    </select>

                    <select
                      value={g3}
                      onChange={(e) => setG3(e.target.value)}
                      className="h-9 w-full rounded border bg-background px-3 text-xs"
                    >
                      {activeMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          Guarantor 3: {m.memberNo} — {m.fullName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(hasDuplicates || borrowerIsGuarantor) && (
                    <p className="text-xs text-rose-600 font-medium">
                      Validation error: Must pick 3 different members, none of whom is the borrower.
                    </p>
                  )}
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
                <Button
                  type="submit"
                  disabled={loading || hasDuplicates || borrowerIsGuarantor}
                >
                  {loading ? 'Submitting...' : 'Submit for Admin Approval'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
