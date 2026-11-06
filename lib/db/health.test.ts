import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countExpectedMigrations, evaluateHealth, migrationsInSync } from "@/lib/db/health";

describe("health migrations", () => {
  it("counts the .sql files in a folder and ignores the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "orbit-migrations-"));
    writeFileSync(join(dir, "001_a.sql"), "SELECT 1;");
    writeFileSync(join(dir, "002_b.sql"), "SELECT 1;");
    writeFileSync(join(dir, "notes.md"), "not a migration");
    expect(countExpectedMigrations(dir)).toBe(2);
  });

  it("counts the migrations shipped in the repo, Phase 10 included", () => {
    const files = readdirSync(join(process.cwd(), "db", "migrations")).filter((f) =>
      f.endsWith(".sql"),
    );
    expect(files).toContain("010_phase10.sql");
    expect(countExpectedMigrations()).toBe(files.length);
  });

  it("returns null for a folder that cannot be read", () => {
    expect(countExpectedMigrations(join(tmpdir(), "orbit-does-not-exist-xyz"))).toBeNull();
  });

  it("is in sync when every shipped migration is applied, or the count is unknown", () => {
    expect(migrationsInSync({ applied: 10, expected: 10 })).toBe(true);
    expect(migrationsInSync({ applied: 11, expected: 10 })).toBe(true);
    expect(migrationsInSync({ applied: 5, expected: null })).toBe(true);
    expect(migrationsInSync({ applied: 9, expected: 10 })).toBe(false);
  });

  it("is not ok when the database is down or a migration is missing", () => {
    const base = { migrations: { applied: 10, expected: 10 }, cronBatchAgeSec: 120 };
    expect(evaluateHealth({ ...base, db: true }).ok).toBe(true);
    expect(evaluateHealth({ ...base, db: false }).ok).toBe(false);
    expect(
      evaluateHealth({ ...base, db: true, migrations: { applied: 9, expected: 10 } }).ok,
    ).toBe(false);
    expect(evaluateHealth({ ...base, db: true })).toEqual({
      ok: true,
      db: true,
      migrations: { applied: 10, expected: 10 },
      cronBatchAgeSec: 120,
    });
  });
});
