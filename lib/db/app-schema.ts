import type { Pool, PoolClient, QueryConfig, QueryResult } from "pg";
import { logger } from "@/lib/logger";

/** Schema that holds every Orbit table. Tenants share it. Other apps stay in public. */
export const APP_SCHEMA = "orbit";

/** Orbit first, then public, so extensions such as gen_random_uuid() still resolve. */
export const APP_SEARCH_PATH = `${APP_SCHEMA}, public`;

const boundClients = new WeakSet<PoolClient>();
const transactionState = new WeakMap<PoolClient, { inTransaction: boolean }>();

type QueryCallback = (error: Error | undefined, result?: QueryResult) => void;

type RawQuery = (queryTextOrConfig: string | QueryConfig, values?: unknown[]) => Promise<QueryResult>;

function queryTextOf(queryTextOrConfig: string | QueryConfig): string {
  return typeof queryTextOrConfig === "string" ? queryTextOrConfig : queryTextOrConfig.text;
}

function sqlCommand(sql: string): string {
  return sql.trim().replace(/\s+/g, " ").replace(/;+\s*$/, "").toUpperCase();
}

function isBegin(command: string): boolean {
  return command === "BEGIN" || command.startsWith("BEGIN ");
}

function isCommit(command: string): boolean {
  return command === "COMMIT" || command.startsWith("COMMIT ");
}

function isRollback(command: string): boolean {
  return command === "ROLLBACK" || command.startsWith("ROLLBACK ");
}

function emptyResult(command: string): QueryResult {
  return { rows: [], command, rowCount: 0, oid: 0, fields: [] };
}

/**
 * Unqualified SQL from this app resolves in `orbit`. The Neon pooler discards session
 * settings between transactions, so the path is set inside each transaction.
 * A bare query is wrapped in its own transaction. `BEGIN` from the caller is kept.
 */
export function bindAppSchema(client: PoolClient): PoolClient {
  let state = transactionState.get(client);
  if (!state) {
    state = { inTransaction: false };
    transactionState.set(client, state);
  }

  if (!boundClients.has(client)) {
    boundClients.add(client);
    wrapQuery(client, state);
  }

  // The pool assigns a new release function on every checkout, after the query wrap.
  if (client.release) {
    const release = client.release.bind(client);
    const current = state;
    client.release = ((err?: Error | boolean) => {
      current.inTransaction = false;
      release(err);
    }) as PoolClient["release"];
  }

  return client;
}

function wrapQuery(client: PoolClient, state: { inTransaction: boolean }): void {
  const original = client.query.bind(client) as RawQuery;

  const execute = async (
    queryTextOrConfig: string | QueryConfig,
    values?: unknown[],
  ): Promise<QueryResult> => {
    const command = sqlCommand(queryTextOf(queryTextOrConfig));

    if (isBegin(command)) {
      const begun = await original(queryTextOrConfig, values);
      try {
        await original("SELECT set_config('search_path', $1, true)", [APP_SEARCH_PATH]);
      } catch (error: unknown) {
        await original("ROLLBACK");
        throw error;
      }
      state.inTransaction = true;
      return begun;
    }

    if (isCommit(command) || isRollback(command)) {
      if (!state.inTransaction) return emptyResult(command);
      try {
        return await original(queryTextOrConfig, values);
      } finally {
        state.inTransaction = false;
      }
    }

    if (state.inTransaction) return original(queryTextOrConfig, values);

    await original("BEGIN");
    try {
      await original("SELECT set_config('search_path', $1, true)", [APP_SEARCH_PATH]);
      const result = await original(queryTextOrConfig, values);
      await original("COMMIT");
      return result;
    } catch (error: unknown) {
      try {
        await original("ROLLBACK");
      } catch (rollbackError: unknown) {
        logger.error("Rollback after app-schema query failed", {
          error: rollbackError instanceof Error ? rollbackError.message : "unknown",
        });
      }
      throw error;
    }
  };

  client.query = ((
    queryTextOrConfig: string | QueryConfig,
    values?: unknown[] | QueryCallback,
    maybeCallback?: QueryCallback,
  ) => {
    const callback = typeof values === "function" ? values : maybeCallback;
    const params = typeof values === "function" ? undefined : values;
    const pending = execute(queryTextOrConfig, params);
    if (callback) {
      pending.then(
        (result) => callback(undefined, result),
        (error: unknown) => {
          callback(error instanceof Error ? error : new Error("Query failed"));
        },
      );
      return undefined;
    }
    return pending;
  }) as PoolClient["query"];

}

/** Every checkout from this pool runs Orbit SQL in the `orbit` schema. */
export function installAppSchema(pool: Pool): Pool {
  const connect = pool.connect.bind(pool);
  pool.connect = ((
    callback?: (
      error: Error | undefined,
      client: PoolClient | undefined,
      done: (release?: Error) => void,
    ) => void,
  ) => {
    if (callback) {
      return connect((error, client, done) => {
        if (error || !client) {
          callback(error ?? undefined, client, done);
          return;
        }
        callback(undefined, bindAppSchema(client), done);
      });
    }
    return connect().then((client) => bindAppSchema(client));
  }) as Pool["connect"];
  return pool;
}
