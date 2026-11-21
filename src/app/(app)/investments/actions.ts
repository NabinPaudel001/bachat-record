'use server';

import { buyInvestment } from '@/server/services/portfolioService';
import { prisma } from '@/server/db';
import { requireRole } from '@/server/auth/rbac';
import { auditLog } from '@/server/audit';
import { revalidatePath } from 'next/cache';
import { Role } from '@prisma/client';

export async function addCategoryAction(name: string) {
  const user = await requireRole(Role.ADMIN);
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Category name is required' };

  try {
    const existing = await prisma.investmentCategory.findUnique({ where: { name: trimmed } });
    if (existing) return { error: 'Category already exists' };

    const cat = await prisma.investmentCategory.create({
      data: { name: trimmed },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE_INVESTMENT_CATEGORY',
      entity: 'InvestmentCategory',
      entityId: cat.id,
      after: { name: cat.name },
    });

    revalidatePath('/investments');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

export async function buyInvestmentAction(params: {
  categoryId: string;
  name: string;
  units?: number;
  cost: number;
  buyDate: string;
  notes?: string;
}) {
  const user = await requireRole(Role.ADMIN, Role.TREASURER);

  try {
    const inv = await buyInvestment({
      categoryId: params.categoryId,
      name: params.name,
      units: params.units,
      cost: params.cost,
      buyDate: new Date(params.buyDate),
      notes: params.notes,
      userId: user.id,
    });

    await auditLog({
      userId: user.id,
      action: 'BUY_INVESTMENT',
      entity: 'Investment',
      entityId: inv.id,
      after: { name: inv.name, cost: inv.cost },
    });

    revalidatePath('/investments');
    revalidatePath('/ledger');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}
