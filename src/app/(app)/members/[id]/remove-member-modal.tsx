'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { removeMemberAction } from '../actions';
import { useRouter } from 'next/navigation';

export function RemoveMemberModal({
  memberId,
  memberNo,
  fullName,
}: {
  memberId: string;
  memberNo: string;
  fullName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    setLoading(true);
    setError(null);
    try {
      const res = await removeMemberAction(memberId);
      if (res?.error) {
        setError(res.error);
        setLoading(false);
      } else {
        setOpen(false);
        router.push('/members');
      }
    } catch {
      setError('Failed to remove member record.');
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 text-xs text-rose-600 border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-800 dark:hover:bg-rose-950/40 gap-1.5 cursor-pointer shadow-sm"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Remove Member (Dev)
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <Card className="w-full max-w-md bg-card shadow-2xl flex flex-col overflow-hidden text-left border-rose-300">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4 bg-rose-50/50 dark:bg-rose-950/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
                <div>
                  <CardTitle className="text-base text-rose-700 dark:text-rose-400">
                    Remove Member (Developer Mode)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Permanent deletion for development and testing
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

              <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/30 p-3 text-xs text-rose-900 dark:text-rose-200 space-y-2">
                <p>
                  You are about to permanently delete member:
                </p>
                <div className="font-semibold text-sm">
                  {fullName} <span className="font-mono text-xs">({memberNo})</span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1 border-t border-rose-200 dark:border-rose-900">
                  This will permanently delete this member and all associated contribution dues, loan records, fines, payments, and account references.
                </p>
              </div>

              <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-md">
                <strong>Note:</strong> This developer button is intended for development and staging cleanups.
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
                onClick={handleRemove}
                disabled={loading}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {loading ? 'Deleting...' : 'Permanently Remove Member'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </>
  );
}
