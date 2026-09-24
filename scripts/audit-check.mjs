/**
 * Dependency audit gate (run: npm run audit:gate).
 *
 * Wraps `npm audit --omit=dev --json` so an advisory that is known and
 * demonstrably not exploitable here can be documented once, in this file, with
 * its reasoning — rather than either blocking every unrelated PR forever or
 * switching the check off entirely. Advisories appear independently of your
 * changes, so without this the gate red-lines work that has nothing to do with
 * the vulnerable package.
 *
 * A package is exempt only when *every* advisory reported against it is listed
 * below, so a second, unrelated CVE on the same package still fails the build.
 * The check is deliberately about production dependencies (`--omit=dev`): those
 * are the ones that ship.
 */
import { spawnSync } from "node:child_process";

/** Advisory URL -> why it is not actionable here. */
const EXEMPTIONS = {
  "https://github.com/advisories/GHSA-2883-xcg3-v3hh":
    "js-yaml 3.x via gray-matter (merge-key CPU denial of service). There is no patched v3 release — the fix is a v4 API change (safeLoad/load) — and gray-matter only parses frontmatter in content/*.md, which is authored locally and never user input, so the vulnerable merge-key path is unreachable.",
};

const FAIL_AT = new Set(["high", "critical"]);

// A shell is needed so the same command works for npm's .cmd shim on Windows;
// passing one command string (rather than an argv array that would be
// concatenated) keeps this clear of the DEP0190 warning.
const result = spawnSync("npm audit --omit=dev --json", {
  encoding: "utf8",
  shell: true,
});

if (!result.stdout) {
  console.error(result.stderr || "npm audit produced no output");
  process.exit(1);
}

/** @type {{vulnerabilities?: Record<string, any>, metadata: {vulnerabilities: Record<string, number>}}} */
const report = JSON.parse(result.stdout);

const exempt = [];
const failures = [];

for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  if (!FAIL_AT.has(vuln.severity)) continue;
  // `via` mixes advisory objects with strings naming the package that pulled
  // this one in; only the objects carry a URL to match on.
  const advisories = (vuln.via ?? []).filter((v) => typeof v === "object");
  const urls = advisories.map((a) => a.url);
  const covered = urls.length > 0 && urls.every((u) => u in EXEMPTIONS);
  (covered ? exempt : failures).push({
    name,
    severity: vuln.severity,
    nodes: vuln.nodes,
    advisories,
    urls,
  });
}

for (const e of exempt) {
  console.log(`exempt  ${e.name} (${e.severity})`);
  for (const url of e.urls) {
    console.log(`          ${url}`);
    console.log(`          reason: ${EXEMPTIONS[url]}`);
  }
}

for (const f of failures) {
  console.error(`FAIL    ${f.name} (${f.severity})`);
  console.error(`          in: ${(f.nodes ?? []).join(", ")}`);
  for (const a of f.advisories) {
    console.error(`          ${a.severity}: ${a.title}`);
    console.error(`          ${a.url}`);
  }
}

const { info, low, moderate, high, critical } = report.metadata.vulnerabilities;
console.log(
  `\nproduction audit: ${critical} critical, ${high} high, ${moderate} moderate, ${low} low, ${info} info`,
);

if (failures.length > 0) {
  const n = `${failures.length} unexempted high/critical advisor${failures.length === 1 ? "y" : "ies"}`;
  console.error(n);
  process.exit(1);
}

const n = `${exempt.length} documented exemption${exempt.length === 1 ? "" : "s"}`;
console.log(`no unexempted high/critical advisories (${n})`);
