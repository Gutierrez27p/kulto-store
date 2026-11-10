import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("new Supabase setup does not grant anonymous write policies", () => {
  const sql = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
  const activeSql = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(activeSql, /create\s+policy\s+["']?public\s+(?:write|update|delete|upload)/i);
  assert.doesNotMatch(activeSql, /on\s+conflict\s*\(id\)\s*do\s+update\s+set\s+public\s*=\s*true/i);
});
