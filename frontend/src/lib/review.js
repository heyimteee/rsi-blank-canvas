export function splitConcerns(text) {
  return String(text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((title) => ({ title }));
}

export function validateMilestones(list) {
  if (!Array.isArray(list) || list.length === 0) return "Add at least one milestone.";
  for (const m of list) {
    if (!m || !m.title || String(m.title).trim().length < 3) {
      return "Each milestone needs a title of at least 3 characters.";
    }
  }
  return null;
}
