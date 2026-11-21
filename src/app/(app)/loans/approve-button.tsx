'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { approveLoanAction } from './actions';

export function ApproveLoanButton({ loanId }: { loanId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    if (!confirm('Are you sure you want to approve and disburse this loan? This will post the cash disbursement journal.')) {
      return;
    }
    setLoading(true);
    try {
      await approveLoanAction(loanId);
      window.location.reload();
    } catch {
      alert('Failed to approve loan.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" onClick={handleApprove} disabled={loading} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
      {loading ? 'Disbursing...' : 'Approve & Disburse'}
    </Button>
  );
}
