import { prisma } from '@/server/db';
import { todayNPT } from '@/server/engines/bs';
import { syncMemberDues, syncLoanInterest } from './syncService';

export interface CronRunResult {
  job: string;
  runDate: Date;
  duesCreated: number;
  finesPosted: number;
  periodsFinalized: number;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}

/**
 * Execute daily catch-up cron job (Section 11).
 * Completely idempotent and catch-up safe.
 * - Generates missing contribution dues and posts Rs 200 missed contribution fines.
 * - Accrues daily interest for active loans and posts Rs 100 missed loan interest fines (with 10-day grace period).
 */
export async function runDailyCron(): Promise<CronRunResult> {
  const nptToday = todayNPT();

  try {
    const duesResult = await syncMemberDues();
    const loanResult = await syncLoanInterest(nptToday);

    const duesCreated = duesResult.duesCreated;
    const finesPosted = duesResult.finesPosted + loanResult.finesPosted;
    const periodsFinalized = loanResult.periodsSynced;

    // Record CronRun log
    await prisma.cronRun.upsert({
      where: {
        job_runDate: {
          job: 'daily-cron',
          runDate: nptToday,
        },
      },
      update: {
        status: 'SUCCESS',
        details: { duesCreated, finesPosted, periodsFinalized },
      },
      create: {
        job: 'daily-cron',
        runDate: nptToday,
        status: 'SUCCESS',
        details: { duesCreated, finesPosted, periodsFinalized },
      },
    });

    return {
      job: 'daily-cron',
      runDate: nptToday,
      duesCreated,
      finesPosted,
      periodsFinalized,
      status: 'SUCCESS',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Cron error:', err);
    return {
      job: 'daily-cron',
      runDate: nptToday,
      duesCreated: 0,
      finesPosted: 0,
      periodsFinalized: 0,
      status: 'FAILED',
      error: message,
    };
  }
}
