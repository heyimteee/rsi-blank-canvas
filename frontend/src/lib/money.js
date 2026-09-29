export const CURRENCIES = ["IDR", "USD"];

export function formatAmountInput(raw) {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function parseAmount(raw) {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  return Number(digits);
}

export function formatMoney(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "Not set";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "Not set";
  const locale = currency === "USD" ? "en-US" : "id-ID";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "IDR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency || ""} ${n.toLocaleString(locale)}`.trim();
  }
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
