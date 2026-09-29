export const CURRENCIES = ["IDR", "USD"];

export function isIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function isPositiveAmount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}
