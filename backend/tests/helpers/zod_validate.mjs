/**
 * Behavioural Zod check used by backend pytest.
 *
 * Usage:
 *   node zod_validate.mjs <schema.ts> <exportName> <jsonPayload>
 *
 * Run with cwd = frontend/ so `zod` resolves from frontend/node_modules.
 * Strips TypeScript `export type` lines and rewrites the zod import to an
 * absolute file URL (ESM does not honour NODE_PATH for bare specifiers).
 */
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [, , schemaPath, exportName, payloadJson] = process.argv;

if (!schemaPath || !exportName || payloadJson === undefined) {
  console.error("usage: zod_validate.mjs <schema.ts> <exportName> <jsonPayload>");
  process.exit(2);
}

const require = createRequire(join(process.cwd(), "package.json"));
const zodHref = pathToFileURL(require.resolve("zod")).href;

let source = readFileSync(schemaPath, "utf8");
source = source.replace(/^export type .*$/gm, "");
source = source.replace(
  /from\s+["']zod["']/,
  `from ${JSON.stringify(zodHref)}`,
);

const dir = mkdtempSync(join(tmpdir(), "untangled-zod-"));
const outPath = join(dir, "schema.mjs");
writeFileSync(outPath, source, "utf8");

const mod = await import(pathToFileURL(outPath).href);
const schema = mod[exportName];
if (!schema || typeof schema.safeParse !== "function") {
  console.log(JSON.stringify({ ok: false, error: `missing export ${exportName}` }));
  process.exit(1);
}

const payload = JSON.parse(payloadJson);
const result = schema.safeParse(payload);
if (result.success) {
  console.log(JSON.stringify({ ok: true }));
  process.exit(0);
}

console.log(
  JSON.stringify({
    ok: false,
    error: result.error.issues.map((issue) => issue.message).join("; "),
  }),
);
process.exit(1);
