import Decimal from 'decimal.js';

export interface PlannerInputs {
  realizedIncome: Decimal | string | number;
  expenses: Decimal | string | number;
  pastDistributionsInWindow: Decimal | string | number;
  bonusBase: Decimal | string | number;
  reservePercent?: Decimal | string | number | null;
  reserveAmount?: Decimal | string | number | null;
  chosenPercent?: Decimal | string | number | null;
  chosenAmount?: Decimal | string | number | null;
  allowReserveDraw?: boolean;
  reserveFloor?: Decimal | string | number;
  cashOnHand?: Decimal | string | number;
}

export interface PlannerResult {
  realizedNetProfit: Decimal;
  reserve: Decimal;
  distributable: Decimal;
  suggestedBonusPct: Decimal;
  chosenBonusAmount: Decimal;
  chosenBonusPct: Decimal;
  shortfall: Decimal;
  reserveAfter: Decimal;
  isFloorBreached: boolean;
  isCashWarning: boolean;
  canConfirm: boolean;
  messages: string[];
}

/**
 * Bonus & Reserve Planner (Section 3.10):
 * Pure calculation to help the admin pick a safe bonus percent / amount.
 */
export function bonusPlanner(inputs: PlannerInputs): PlannerResult {
  const inc = new Decimal(inputs.realizedIncome.toString());
  const exp = new Decimal(inputs.expenses.toString());
  const pastDist = new Decimal(inputs.pastDistributionsInWindow.toString());
  const base = new Decimal(inputs.bonusBase.toString());
  const allowDraw = inputs.allowReserveDraw ?? true;
  const floor = new Decimal((inputs.reserveFloor ?? 0).toString());
  const cash = new Decimal((inputs.cashOnHand ?? 0).toString());

  const realizedNetProfit = Decimal.max(0, inc.minus(exp).minus(pastDist));

  let reserve = new Decimal(0);
  if (inputs.reservePercent !== undefined && inputs.reservePercent !== null) {
    const rPct = new Decimal(inputs.reservePercent.toString());
    reserve = realizedNetProfit.mul(rPct).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else if (inputs.reserveAmount !== undefined && inputs.reserveAmount !== null) {
    reserve = new Decimal(inputs.reserveAmount.toString());
  }

  const distributable = Decimal.max(0, realizedNetProfit.minus(reserve));

  let suggestedBonusPct = new Decimal(0);
  if (base.gt(0)) {
    suggestedBonusPct = distributable.div(base).mul(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  }

  let chosenBonusAmount = new Decimal(0);
  let chosenBonusPct = new Decimal(0);

  if (inputs.chosenPercent !== undefined && inputs.chosenPercent !== null) {
    chosenBonusPct = new Decimal(inputs.chosenPercent.toString());
    chosenBonusAmount = base.mul(chosenBonusPct).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else if (inputs.chosenAmount !== undefined && inputs.chosenAmount !== null) {
    chosenBonusAmount = new Decimal(inputs.chosenAmount.toString());
    if (base.gt(0)) {
      chosenBonusPct = chosenBonusAmount.div(base).mul(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    }
  } else {
    // Default to suggested
    chosenBonusPct = suggestedBonusPct;
    chosenBonusAmount = distributable;
  }

  const shortfall = Decimal.max(0, chosenBonusAmount.minus(distributable));

  let reserveAfter = reserve;
  if (shortfall.gt(0)) {
    if (allowDraw) {
      reserveAfter = reserve.minus(shortfall);
    } else {
      reserveAfter = reserve;
    }
  }

  const isFloorBreached = reserveAfter.lt(floor);
  const isCashWarning = cash.lt(chosenBonusAmount);
  const messages: string[] = [];

  if (isFloorBreached) {
    messages.push(`Reserve after payout (${reserveAfter.toFixed(2)}) is below the required reserve floor (${floor.toFixed(2)}).`);
  }
  if (isCashWarning) {
    messages.push(`Cash on hand (${cash.toFixed(2)}) is less than total bonus payout (${chosenBonusAmount.toFixed(2)}).`);
  }

  const canConfirm = !isFloorBreached && (allowDraw || shortfall.isZero());

  return {
    realizedNetProfit,
    reserve,
    distributable,
    suggestedBonusPct,
    chosenBonusAmount,
    chosenBonusPct,
    shortfall,
    reserveAfter,
    isFloorBreached,
    isCashWarning,
    canConfirm,
    messages,
  };
}

/**
 * Distribute an exact total amount across lines proportionally to base,
 * with rounding remainder allocated to the largest line (Section 6).
 */
export function allocateDistributionLines(
  totalAmount: Decimal | string | number,
  memberBases: { memberId: string; base: Decimal }[]
): { memberId: string; base: Decimal; amount: Decimal }[] {
  const targetTotal = new Decimal(totalAmount.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const totalBase = memberBases.reduce((acc, m) => acc.plus(m.base), new Decimal(0));

  if (totalBase.isZero() || memberBases.length === 0) {
    return memberBases.map((m) => ({ memberId: m.memberId, base: m.base, amount: new Decimal(0) }));
  }

  let distributedSum = new Decimal(0);
  let maxLineIdx = 0;
  let maxLineAmount = new Decimal(-1);

  const lines = memberBases.map((m, idx) => {
    // Proportional share
    const raw = m.base.div(totalBase).mul(targetTotal);
    const rounded = raw.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    distributedSum = distributedSum.plus(rounded);

    if (rounded.gt(maxLineAmount)) {
      maxLineAmount = rounded;
      maxLineIdx = idx;
    }

    return {
      memberId: m.memberId,
      base: m.base,
      amount: rounded,
    };
  });

  // Assign any rounding discrepancy (cents/paisa) to the largest line
  const diff = targetTotal.minus(distributedSum);
  if (!diff.isZero() && lines[maxLineIdx]) {
    lines[maxLineIdx].amount = lines[maxLineIdx].amount.plus(diff);
  }

  return lines;
}
