'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Plus, X } from 'lucide-react';
import { addMemberAction } from './actions';
import { NepaliDatePicker } from '@/components/ui/nepali-date-picker';

export function AddMemberModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const res = await addMemberAction(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
      }
    } catch {
      setError('An error occurred while saving the member.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="flex items-center gap-1.5 shadow-sm">
        <Plus className="h-4 w-4" /> Add New Member
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <Card className="w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden bg-card shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b p-4">
              <CardTitle className="text-lg">Add New Group Member</CardTitle>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <form action={handleSubmit} className="overflow-y-auto flex-1 p-4 space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Full Name *</label>
                  <input
                    name="fullName"
                    required
                    placeholder="e.g. Sita Kumari Shrestha"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Phone Number *</label>
                  <input
                    name="phone"
                    required
                    placeholder="e.g. 9841234567"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Alternate Phone</label>
                  <input
                    name="altPhone"
                    placeholder="Optional"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Email Address</label>
                  <input
                    name="email"
                    type="email"
                    placeholder="Optional"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Permanent Address *</label>
                  <input
                    name="permanentAddress"
                    required
                    placeholder="e.g. Pokhara, Ward 4"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Current Address</label>
                  <input
                    name="currentAddress"
                    placeholder="e.g. Kathmandu"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Citizenship / ID No</label>
                  <input
                    name="idNumber"
                    placeholder="Encrypted at rest"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <NepaliDatePicker name="joinDate" label="Join Date (BS)" required />
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Monthly Amount (NPR) *</label>
                  <input
                    name="monthlyAmount"
                    type="number"
                    step="any"
                    required
                    defaultValue="1000"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <h4 className="text-xs font-bold uppercase text-muted-foreground">Nominee Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    name="nomineeName"
                    placeholder="Nominee Name"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <input
                    name="nomineeRelation"
                    placeholder="Relation (e.g. Spouse)"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <input
                    name="nomineePhone"
                    placeholder="Nominee Phone"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
              </div>

              <CardFooter className="p-0 pt-4 border-t flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Saving...' : 'Enroll Member'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
