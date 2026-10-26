// Checks a scenario file and lists any copy the author still needs to write.
// Run: node scripts/check-scenario.mjs incident-file-01

import { readFile } from "node:fs/promises";

const name = process.argv[2] || "incident-file-01";
const scenario = JSON.parse(await readFile(new URL(`../site/scenarios/${name}.json`, import.meta.url), "utf8"));

const todos = [];
const problems = [];

(function walk(node, path) {
  if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
  if (node && typeof node === "object") {
    if ("todo" in node) return todos.push(node.todo);
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
  }
})(scenario, "");

// Every rule must point at a real screen, option or thread.
const choices = Object.fromEntries(scenario.screens.filter((s) => s.options).map((s) => [s.id, s.options.map((o) => o.id)]));
for (const [id, th] of Object.entries(scenario.threads)) choices[id] = th.options.map((o) => o.id);
(function rules(node) {
  if (Array.isArray(node)) return node.forEach(rules);
  if (!node || typeof node !== "object") return;
  if (typeof node.picked === "string") {
    const [c, o] = node.picked.split(":");
    if (!choices[c] || !choices[c].includes(o)) problems.push(`Rule refers to an unknown choice: ${node.picked}`);
  }
  if (typeof node.pulled === "string" && !scenario.threads[node.pulled]) problems.push(`Rule refers to an unknown thread: ${node.pulled}`);
  if (typeof node.thread === "string" && !scenario.threads[node.thread]) problems.push(`Screen links to an unknown thread: ${node.thread}`);
  Object.values(node).forEach(rules);
})(scenario);

const ids = scenario.screens.map((s) => s.id);
if (new Set(ids).size !== ids.length) problems.push("Two screens share the same id.");

console.log(`${scenario.title}: ${scenario.screens.length} screens, ${Object.keys(scenario.threads).length} threads.`);
if (problems.length) {
  console.log(`\nProblems (${problems.length}):`);
  problems.forEach((p) => console.log(`  - ${p}`));
}
console.log(`\nCopy still needed (${todos.length}):`);
todos.forEach((t) => console.log(`  - ${t}`));
process.exitCode = problems.length ? 1 : 0;
