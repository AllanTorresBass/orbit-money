import type { PoolClient, QueryResult } from "pg";
import { describe, expect, it } from "vitest";
import { APP_SEARCH_PATH, bindAppSchema } from "@/lib/db/app-schema";

function emptyResult(): QueryResult {
  return { rows: [], command: "", rowCount: 0, oid: 0, fields: [] };
}

function fakeClient(options?: { failOn?: string }): { client: PoolClient; calls: string[] } {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (options?.failOn && sql.includes(options.failOn)) {
        throw new Error("boom");
      }
      return emptyResult();
    },
    release: () => undefined,
  };
  return { client: bindAppSchema(client as unknown as PoolClient), calls };
}

describe("bindAppSchema", () => {
  it("sets the orbit search path inside a caller transaction", async () => {
    const { client, calls } = fakeClient();
    await client.query("BEGIN");
    await client.query("SELECT id FROM tenants");
    await client.query("COMMIT");
    expect(calls).toEqual([
      "BEGIN",
      "SELECT set_config('search_path', $1, true)",
      "SELECT id FROM tenants",
      "COMMIT",
    ]);
    expect(APP_SEARCH_PATH.startsWith("orbit")).toBe(true);
  });

  it("wraps a bare query so the path survives the connection pooler", async () => {
    const { client, calls } = fakeClient();
    await client.query("SELECT id FROM envelopes WHERE id = $1", ["abc"]);
    expect(calls[0]).toBe("BEGIN");
    expect(calls[1]).toBe("SELECT set_config('search_path', $1, true)");
    expect(calls[2]).toBe("SELECT id FROM envelopes WHERE id = $1");
    expect(calls[3]).toBe("COMMIT");
  });

  it("rolls back a bare query that fails", async () => {
    const { client, calls } = fakeClient({ failOn: "FROM tenants" });
    await expect(client.query("SELECT id FROM tenants")).rejects.toThrow("boom");
    expect(calls.at(-1)).toBe("ROLLBACK");
  });

  it("does not roll back twice when BEGIN already closed the transaction", async () => {
    const { client, calls } = fakeClient({ failOn: "set_config" });
    await expect(client.query("BEGIN")).rejects.toThrow("boom");
    await client.query("ROLLBACK");
    expect(calls.filter((sql) => sql === "ROLLBACK")).toEqual(["ROLLBACK"]);
  });
});
