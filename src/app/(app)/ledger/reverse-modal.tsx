'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { reverseJournalAction } from './actions';
import { RotateCcw, X } from 'lucide-react';

export function ReverseJournalModal({
  journalId,
  description,
}: {
  journalId: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('Incorrect data entry correction');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReverse(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await reverseJournalAction({ journalId, reason });
      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        window.location.reload();
      }
    } catch {
      setError('Failed to reverse journal entry.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-6 text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 flex items-center gap-1"
      >
        <RotateCcw className="h-3 w-3" /> Reverse Entry
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md bg-card shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4">
              <CardTitle className="text-base">Reverse Accounting Journal</CardTitle>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <form onSubmit={handleReverse}>
              <CardContent className="p-4 space-y-3 text-sm">
                {error && (
                  <div className="rounded bg-destructive/10 p-2 text-destructive text-xs">
                    {error}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Original: <strong className="text-foreground">{description}</strong>
                </p>
                <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200">
                  Per strict double-entry rules, journals cannot be deleted or modified. This action will post an equal and opposite reversal journal linked to the original.
                </p>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Mandatory Reversal Reason *</label>
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
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={loading}>
                  {loading ? 'Reversing...' : 'Post Reversal Journal'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
