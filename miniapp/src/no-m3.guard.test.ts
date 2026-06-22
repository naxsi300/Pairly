import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const M3 = /\b(--m3-[a-z-]+|card-m3|card-m3-low|input-m3|surface-m3|navbar-m3|btn-m3-[a-z]+|text-m3-[a-z]+|text-red-[0-9]+)\b/;

describe("no M3 references", () => {
  it("no source file or index.css references M3 tokens/classes", () => {
    const offenders: string[] = [];
    const check = (path: string, text: string) => {
      const m = text.match(M3);
      if (m) offenders.push(`${path}: ${m[0]}`);
    };
    check("index.css", readFileSync(join(ROOT, "index.css"), "utf8"));
    const visit = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) visit(p);
        else if (/\.(tsx?|css)$/.test(e.name) && p !== SELF) check(p, readFileSync(p, "utf8"));
      }
    };
    visit(ROOT);
    expect(offenders).toEqual([]);
  });
});
