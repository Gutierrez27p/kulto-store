import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("production Supabase audit script is read-only", () => {
  const sql = readFileSync(new URL("../security/supabase-readonly-audit.sql", import.meta.url), "utf8");
  const withoutComments = sql.replace(/--[^\n]*/g, "");
  assert.match(withoutComments, /pg_policies/i);
  assert.match(withoutComments, /relrowsecurity/i);
  assert.match(withoutComments, /role_table_grants/i);
  assert.match(withoutComments, /storage\.buckets/i);
  assert.match(withoutComments, /storage\.objects/i);
  assert.doesNotMatch(withoutComments, /\b(?:insert|update|delete|alter|drop|truncate|create|grant|revoke|execute|call|do)\b/i);
  assert.doesNotMatch(withoutComments, /\b(?:value|password|email)\s*(?:,|from|as)\b/i);
});
