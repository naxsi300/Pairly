import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(ROOT, "..", "..", "index.css");
const css = readFileSync(CSS_PATH, "utf8");

/**
 * Guard test for two animation keyframes referenced inline by the home cards.
 * The cards set `animation: "occasion-pulse ..."` (OccasionCard "скоро" dot)
 * and `animation: "pulse ..."` (GiftsCard "Ждёт" badge). If either keyframe
 * is missing from index.css, the pulse is a silent no-op and the alive cue
 * disappears without any runtime error.
 */
describe("home-card pulse keyframes", () => {
  it("defines @keyframes occasion-pulse", () => {
    expect(css).toMatch(/@keyframes\s+occasion-pulse\b/);
  });

  it("defines @keyframes pulse", () => {
    expect(css).toMatch(/@keyframes\s+pulse\b/);
  });
});
