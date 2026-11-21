import Decimal from 'decimal.js';
import { prisma } from './db';

/** Known settings keys with their types and defaults */
const DEFAULTS = {
  contributionFine: new Decimal(200),
  loanInterestFine: new Decimal(100),
  contributionGraceDay: 10 as number,
  loanInterestGraceDay: 10 as number,
  dayCountBasis: 365 as number,
  monthlyAmountDefault: new Decimal(1000),
  bonusIncludesUnpaid: true as boolean,
  interestIncludesUnpaid: false as boolean,
  payoutMode: 'PAYABLE' as string,
  allowReserveDraw: true as boolean,
  reserveFloor: new Decimal(0),
  helperPaymentsNeedApproval: true as boolean,
} as const;

export type SettingKey = keyof typeof DEFAULTS;
type SettingValue<K extends SettingKey> = (typeof DEFAULTS)[K];

/** Cache entry */
interface CacheEntry {
  data: Map<string, unknown>;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache: CacheEntry | null = null;

/** Load all settings from DB into cache */
async function loadSettings(): Promise<Map<string, unknown>> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.data;
  }

  const rows = await prisma.setting.findMany();
  const data = new Map<string, unknown>();

  for (const row of rows) {
    data.set(row.key, row.value);
  }

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

/** Invalidate the settings cache */
export function invalidateSettingsCache(): void {
  cache = null;
}

/** Get a single setting value with type safety */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const data = await loadSettings();
  const raw = data.get(key);

  if (raw === undefined || raw === null) {
    return DEFAULTS[key] as SettingValue<K>;
  }

  const defaultVal = DEFAULTS[key];

  // Coerce to the correct type based on the default value's type
  if (defaultVal instanceof Decimal) {
    return new Decimal(String(raw)) as SettingValue<K>;
  }
  if (typeof defaultVal === 'boolean') {
    return Boolean(raw) as SettingValue<K>;
  }
  if (typeof defaultVal === 'number') {
    return Number(raw) as SettingValue<K>;
  }

  return raw as SettingValue<K>;
}

/** Get all settings as an object */
export async function getAllSettings(): Promise<{
  [K in SettingKey]: SettingValue<K>;
}> {
  const result = {} as Record<string, unknown>;
  for (const key of Object.keys(DEFAULTS) as SettingKey[]) {
    result[key] = await getSetting(key);
  }
  return result as { [K in SettingKey]: SettingValue<K> };
}

/** Update a setting value (caller must enforce Admin authorization) */
export async function updateSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>
): Promise<void> {
  const serialized = value instanceof Decimal ? value.toString() : value;

  await prisma.setting.upsert({
    where: { key },
    update: { value: serialized as never },
    create: { key, value: serialized as never },
  });

  invalidateSettingsCache();
}
