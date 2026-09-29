export function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function requestTerms(overrides = {}) {
  return { budget_amount: 7500000, budget_currency: "IDR", deadline: plusDays(30), ...overrides };
}

export function revisionTerms(overrides = {}) {
  return {
    delivery_date: plusDays(14),
    new_budget_amount: 8000000,
    added_cost_amount: 500000,
    budget_currency: "IDR",
    ...overrides,
  };
}
