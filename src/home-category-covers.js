// Custom image overrides first; original catalog photo remains a safe fallback.
export function coverForHomeCategory(covers, id, autoPhoto = null) {
  const configured = covers && typeof covers[id] === "string" ? covers[id].trim() : "";
  return configured || autoPhoto || null;
}
