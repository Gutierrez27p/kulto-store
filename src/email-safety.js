export function escapeEmailHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Browser-side legacy account flow; codes must never use Math.random().
export function secureSixDigitCode() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Este navegador no permite generar códigos seguros.");
  }
  const nums = new Uint32Array(1);
  // Rejection sampling avoids modulo bias across 900,000 possible codes.
  const range = 900_000;
  const limit = Math.floor(0x100000000 / range) * range;
  do {
    globalThis.crypto.getRandomValues(nums);
  } while (nums[0] >= limit);
  return String(100_000 + nums[0] % range);
}
