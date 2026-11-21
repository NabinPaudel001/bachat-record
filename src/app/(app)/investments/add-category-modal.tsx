'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Plus, X } from 'lucide-react';
import { addCategoryAction } from './actions';

export function AddCategoryModal() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await addCategoryAction(name);
      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        window.location.reload();
      }
    } catch {
      setError('Failed to create category.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="flex items-center gap-1.5 shadow-sm">
        <Plus className="h-4 w-4" /> Add Category
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm bg-card shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4">
              <CardTitle className="text-base">New Investment Category</CardTitle>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <form onSubmit={handleAdd}>
              <CardContent className="p-4 space-y-3 text-sm">
                {error && (
                  <div className="rounded bg-destructive/10 p-2 text-destructive text-xs">
                    {error}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Category Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Real Estate, Commercial Land"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-9 w-full rounded border bg-background px-3 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This category will appear on the dashboard and financial statements immediately.
                  </p>
                </div>
              </CardContent>

              <CardFooter className="p-4 border-t flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Category'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
