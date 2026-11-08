import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flatten(value as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe("message catalogs", () => {
  it("keeps English and Spanish key trees in parity", () => {
    const root = join(process.cwd(), "messages");
    const en = JSON.parse(readFileSync(join(root, "en.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const es = JSON.parse(readFileSync(join(root, "es.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const enKeys = flatten(en).sort();
    const esKeys = flatten(es).sort();
    expect(esKeys).toEqual(enKeys);
  });
});
