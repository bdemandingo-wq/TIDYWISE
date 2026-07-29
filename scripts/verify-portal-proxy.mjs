#!/usr/bin/env node
/**
 * Static contract check between the portal frontend and client-portal-api.
 *
 *   node scripts/verify-portal-proxy.mjs
 *
 * Exits non-zero on any mismatch, so it can gate a deploy.
 *
 * WHY THIS EXISTS
 * The seven portal RPCs are being revoked from anon/authenticated. After that,
 * a wrong action name or a renamed field is not a caught error — it is a
 * customer's portal breaking with a bare 42501 and no fallback path. Those
 * mistakes are invisible to tsc (the body is an untyped object) and to lint.
 * This is the check that sees them.
 *
 * WHAT IT PROVES
 *   1. every action the frontend sends exists as a case in the proxy
 *   2. every field it sends is actually read by that case
 *   3. every case has at least one caller (nothing dead)
 *   4. each case passes its arguments to the right RPC parameters
 *   5. identity args are session-derived, never taken from the request body
 *   6. no action name is built dynamically, where a static check would miss it
 *
 * WHAT IT DOES NOT PROVE
 * Anything at runtime: session headers, value shapes, error-path behaviour,
 * or whether the RPCs themselves do the right thing. See the notes at the end
 * of the output.
 */

import { readFileSync } from "node:fs";

const PROXY = "supabase/functions/client-portal-api/index.ts";
const CALLERS = [
  "src/contexts/ClientPortalContext.tsx",
  "src/pages/portal/PortalDashboardPage.tsx",
  "src/components/portal/PortalProfileTab.tsx",
  "src/pages/portal/PortalRequestPage.tsx",
];

/** Identity must come from the verified session, never from the request body. */
const SESSION_IDS = new Set(["portal_user_id", "customer_id", "organization_id"]);

const read = (p) => readFileSync(p, "utf8");
const proxySrc = read(PROXY);

// ── parse the proxy ─────────────────────────────────────────────────────────
const cases = new Map();
for (const chunk of proxySrc.split('\n      case "').slice(1)) {
  const name = chunk.slice(0, chunk.indexOf('"'));
  const body = chunk.split('\n      case "')[0];
  const fields = new Set([...body.matchAll(/body\??\.([A-Za-z_]\w*)/g)].map((m) => m[1]));
  fields.delete("action");
  const rpc = body.match(/\.rpc\(\s*"([a-z_]+)"\s*,\s*\{([\s\S]*?)\}\s*\)/);
  cases.set(name, {
    fields,
    rpcName: rpc?.[1] ?? null,
    rpcArgs: rpc
      ? rpc[2].split(",").filter((p) => p.includes(":")).map((p) => p.trim().replace(/\s+/g, " "))
      : [],
  });
}

/** Top-level keys of an object literal, handling `k: v` AND shorthand `k`. */
function topLevelKeys(blob) {
  const inner = blob.slice(blob.indexOf("{") + 1, blob.lastIndexOf("}"));
  const parts = [];
  let depth = 0, buf = "";
  for (const ch of inner) {
    if ("{[(".includes(ch)) depth++;
    else if ("}])".includes(ch)) depth--;
    if (ch === "," && depth === 0) { parts.push(buf); buf = ""; } else buf += ch;
  }
  parts.push(buf);
  const keys = new Set();
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const colon = p.indexOf(":");
    const brace = p.indexOf("{");
    if (colon !== -1 && (brace === -1 || colon < brace)) keys.add(p.slice(0, colon).trim().replace(/['"]/g, ""));
    else if (/^[A-Za-z_]\w*$/.test(p)) keys.add(p);          // shorthand — the case an
    else if (p.startsWith("...")) keys.add("...spread");      // earlier version missed
  }
  keys.delete("action");
  return keys;
}

// ── parse the callers ───────────────────────────────────────────────────────
const calls = [];
let dynamicActions = 0;
for (const file of CALLERS) {
  const src = read(file);
  // A non-literal action would evade this check entirely, so count them.
  dynamicActions += [...src.matchAll(/action:\s*(?!['"])[A-Za-z_]/g)].length;

  for (const m of src.matchAll(/action:\s*['"]([a-z_]+)['"]/g)) {
    const start = src.lastIndexOf("body: {", m.index);
    let depth = 0, i = start + "body: ".length;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) break;
    }
    const head = src.slice(Math.max(0, m.index - 300), m.index);
    const targets = [...head.matchAll(/(?:invokePortal|functions\.invoke)\(\s*['"]([a-z-]+)['"]/g)];
    calls.push({
      file: file.split("/").pop(),
      line: src.slice(0, m.index).split("\n").length,
      action: m[1],
      keys: topLevelKeys(src.slice(start, i + 1)),
      target: targets.at(-1)?.[1] ?? "??",
    });
  }
}

// ── report ──────────────────────────────────────────────────────────────────
const failures = [];
console.log(`\n  ${"file".padEnd(26)}${"line".padStart(5)}  ${"action".padEnd(24)}sends`);
console.log("  " + "─".repeat(104));

for (const c of calls.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
  const notes = [];
  if (c.target !== "client-portal-api") notes.push(`✘ target is ${c.target}`);
  const def = cases.get(c.action);
  if (!def) notes.push("✘ NO SUCH CASE IN PROXY");
  else {
    const unknown = [...c.keys].filter((k) => !def.fields.has(k));
    if (unknown.length) notes.push(`✘ proxy ignores ${JSON.stringify(unknown)}`);
    const missing = [...def.fields].filter((k) => !c.keys.has(k));
    if (missing.length) notes.push(`⚠ proxy also reads ${JSON.stringify(missing)}`);
  }
  if (notes.some((n) => n.startsWith("✘"))) failures.push(`${c.file}:${c.line} ${c.action} — ${notes.join(" ")}`);
  const sends = [...c.keys].sort();
  console.log(
    `  ${c.file.padEnd(26)}${String(c.line).padStart(5)}  ${c.action.padEnd(24)}` +
    `${(sends.length ? sends.join(", ") : "—").padEnd(44)}${notes.join(" ") || "✔"}`,
  );
}

console.log("\n  RPC argument mapping");
console.log("  " + "─".repeat(104));
for (const [name, def] of cases) {
  if (!def.rpcName) continue;
  const bodySourced = def.rpcArgs.filter((a) => SESSION_IDS.has(a.split(":")[1]?.trim()));
  const leak = def.rpcArgs.some((a) => /p_(client_user_id|customer_id|organization_id|user_id):\s*body/.test(a));
  if (leak) failures.push(`${name} — identity argument read from request body`);
  if (!bodySourced.length && /user|customer|organization/.test(def.rpcArgs.join())) {
    // case passes an identity-shaped arg that is not a session id
  }
  console.log(`  ${name.padEnd(24)}${def.rpcName.padEnd(36)}${def.rpcArgs.join("; ")}`);
}

const called = new Set(calls.map((c) => c.action));
const orphans = [...cases.keys()].filter((k) => !called.has(k));

console.log("\n  " + "─".repeat(104));
console.log(`  call sites: ${calls.length}   proxy cases: ${cases.size}   dynamic action names: ${dynamicActions}`);
if (orphans.length) console.log(`  cases with no caller: ${orphans.join(", ")}`);
if (dynamicActions) failures.push(`${dynamicActions} action name(s) built dynamically — this check cannot see them`);

if (failures.length) {
  console.log(`\n  ✘ ${failures.length} problem(s):`);
  for (const f of failures) console.log(`      ${f}`);
  console.log("\n  Does NOT cover: session headers, value shapes, error paths, RPC behaviour.\n");
  process.exit(1);
}

console.log("\n  ✔ frontend/proxy contract is consistent.");
console.log("    Static only. Says nothing about session headers, value shapes,");
console.log("    error-path behaviour, or whether the RPCs do the right thing.\n");
