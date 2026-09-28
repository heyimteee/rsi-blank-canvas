export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

export function validateIntake(v) {
  if (!v || typeof v !== "object") return "Please complete the form.";
  if (!v.client_name || String(v.client_name).trim().length < 2) return "Enter your name.";
  if (!isValidEmail(String(v.client_email || "").trim().toLowerCase())) return "Enter a valid email address.";
  if (!v.title || String(v.title).trim().length < 4) return "Give your project a title of at least 4 characters.";
  if (!v.details || String(v.details).trim().length < 10) return "Describe your needs in at least 10 characters.";
  return null;
}

export function validateRevision(v) {
  if (!v || typeof v !== "object") return "Please complete the form.";
  if (!v.general_details || String(v.general_details).trim().length < 10)
    return "Describe the revision in at least 10 characters.";
  if (!v.terms || String(v.terms).trim().length < 4) return "Add the terms for this revision.";
  return null;
}
