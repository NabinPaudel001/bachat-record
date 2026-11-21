'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { closeMemberAccountAction } from './actions';
import { AlertCircle, X } from 'lucide-react';

export function CloseAccountModal({
  member,
}: {
  member: {
    id: string;
    fullName: string;
    memberNo: string;
    totalDeposited: string | number;
    totalLoanPrincipal: string | number;
    guarantees: { id: string; loan: { status: string; loanNo: string } }[];
  };
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLoanCount = Number(member.totalLoanPrincipal.toString()) > 0;
  const activeGuarantees = member.guarantees.filter((g) => g.loan.status === 'ACTIVE');

  async function handleClose(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const res = await closeMemberAccountAction(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        window.location.reload();
      }
    } catch {
      setError('An error occurred while closing the account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
        className="shadow-sm"
      >
        Close Account
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg bg-card shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4">
              <CardTitle className="text-lg text-destructive">
                Close Account: {member.fullName} ({member.memberNo})
              </CardTitle>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <form action={handleClose}>
              <CardContent className="p-4 space-y-4 text-sm">
                {error && (
                  <div className="rounded bg-destructive/10 p-3 text-destructive text-xs">
                    {error}
                  </div>
                )}

                {activeLoanCount && (
                  <div className="p-3 bg-red-100 border border-red-300 rounded text-red-800 text-xs flex gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                      Blocked: Member has active outstanding loans. Loans must be fully paid and closed first.
                    </span>
                  </div>
                )}

                {activeGuarantees.length > 0 && (
                  <div className="p-3 bg-amber-100 border border-amber-300 rounded text-amber-800 text-xs flex gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                      Warning: Member is an active guarantor on {activeGuarantees.length} loan(s). You must replace the guarantor before closing.
                    </span>
                  </div>
                )}

                <input type="hidden" name="memberId" value={member.id} />

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Exit Date *</label>
                  <input
                    type="date"
                    name="exitDate"
                    required
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="h-9 w-full rounded border px-3 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Reason for Closure *</label>
                  <textarea
                    name="closeReason"
                    required
                    placeholder="e.g. Relocated to another city, formal resignation"
                    className="w-full rounded border p-2 text-sm min-h-[60px]"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="waiveFines"
                    name="waiveFines"
                    value="true"
                    defaultChecked
                    className="h-4 w-4 rounded"
                  />
                  <label htmlFor="waiveFines" className="text-xs font-medium">
                    Waive remaining pending fines on exit
                  </label>
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
                  variant="destructive"
                  disabled={loading || activeLoanCount || activeGuarantees.length > 0}
                >
                  {loading ? 'Closing Account...' : 'Confirm Account Closure'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
