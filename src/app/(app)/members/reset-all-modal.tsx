'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, AlertTriangle, X, ShieldAlert } from 'lucide-react';
import { resetAllRecordsAction } from './actions';

export function ResetAllRecordsModal() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    if (confirmText.trim().toUpperCase() !== 'RESET') {
      setError('Please type RESET in capital letters to confirm.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await resetAllRecordsAction();
      if (res?.error) {
        setError(res.error);
        setLoading(false);
      } else {
        setOpen(false);
        window.location.href = '/members';
      }
    } catch {
      setError('Failed to reset all records.');
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setConfirmText('');
          setError(null);
          setOpen(true);
        }}
        className="flex items-center gap-1.5 shadow-sm text-xs border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900 dark:hover:bg-rose-950/30"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Reset All Records (Dev)
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <Card className="w-full max-w-lg bg-card shadow-2xl flex flex-col overflow-hidden text-left border-rose-400">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4 bg-rose-50/70 dark:bg-rose-950/30">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
                <div>
                  <CardTitle className="text-base text-rose-700 dark:text-rose-400">
                    Remove All Records Till Now
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Developer clean-slate wipe tool
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <div className="p-5 space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive font-medium border border-destructive/20">
                  {error}
                </div>
              )}

              <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20 p-3.5 text-xs text-rose-900 dark:text-rose-200 space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                  <AlertTriangle className="h-4 w-4" />
                  Warning: Irreversible Developer Action
                </div>
                <p>
                  This action will permanently delete <strong>all records created till now</strong>:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-muted-foreground">
                  <li>All member accounts & profile records</li>
                  <li>All monthly levy contributions & due records</li>
                  <li>All loan applications, events, and interest periods</li>
                  <li>All penalty/fine records (levy & loan fines)</li>
                  <li>All payments, receipts, and allocation history</li>
                </ul>
                <p className="font-semibold text-rose-700 dark:text-rose-300 pt-1">
                  System users, roles, and chart of accounts will be preserved so you can test fresh.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">
                  Type <span className="font-mono text-rose-600 font-bold">RESET</span> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type RESET"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono"
                  autoFocus
                />
              </div>
            </div>

            <CardFooter className="border-t p-4 flex items-center justify-end gap-2 bg-muted/10">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={handleReset}
                disabled={loading || confirmText.trim().toUpperCase() !== 'RESET'}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {loading ? 'Wiping All Records...' : 'Wipe All Operational Records'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </>
  );
}
