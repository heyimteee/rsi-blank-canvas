import { parseAmount } from "./money.js";

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

export function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function validateIntake(v) {
  if (!v || typeof v !== "object") return "Please complete the form.";
  if (!v.client_name || String(v.client_name).trim().length < 2) return "Enter your name.";
  if (!isValidEmail(String(v.client_email || "").trim().toLowerCase())) return "Enter a valid email address.";
  if (!v.title || String(v.title).trim().length < 4) return "Give your project a title of at least 4 characters.";
  if (!v.details || String(v.details).trim().length < 10) return "Describe your needs in at least 10 characters.";
  if (parseAmount(v.budget_amount) <= 0) return "Enter your budget as a number greater than zero.";
  if (!v.budget_currency) return "Choose a currency for your budget.";
  if (!isValidDate(v.deadline)) return "Pick the date you need this finished by.";
  return null;
}

export function validateRevision(v) {
  if (!v || typeof v !== "object") return "Please complete the form.";
  if (!v.general_details || String(v.general_details).trim().length < 10)
    return "Describe the change in at least 10 characters.";
  if (!isValidDate(v.delivery_date)) return "Pick the date you need this change delivered by.";
  if (parseAmount(v.new_budget_amount) <= 0) return "Enter the new total project budget.";
  const added = v.added_cost_amount;
  if (added === undefined || added === null || String(added).trim() === "")
    return "Enter the added cost of this change, or zero if there is none.";
  if (!v.budget_currency) return "Choose a currency for the budget.";
  return null;
}
