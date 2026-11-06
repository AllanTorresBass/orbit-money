import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { canConfigure, canSpend, type MembershipRole } from "@/lib/auth/permissions";
import { lockTenantForUpdate } from "@/lib/db/advisory-lock";
import { withTransaction } from "@/lib/db/connection";
import {
  ConflictError,
  isUniqueViolation,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/service-errors";
import { fromCents, toCents } from "@/lib/money/numeric";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { discardPipelineRun } from "@/lib/pipeline/telemetry";
import { withPipelineRun } from "@/lib/pipeline/with-run";
import { BaseService } from "@/lib/services/base/BaseService";
import type {
  RecordInflowBody,
  RecordOutflowBody,
  TransactionResult,
} from "@/types/transactions/transaction.types";

type LedgerKind = "purchase" | "inflow" | "outflow";

interface PostInput {
  kind: LedgerKind;
  tenantId: string;
  userId: string;
  /** Always positive. The kind decides the sign. */
  amountCents: number;
  idempotencyKey: string;
  memo: string;
  bookedDate?: string;
  /** Test/support override for the tenant-local "today". */
  asOfDate?: string;
  accountId?: string;
  scheduleId?: string;
  envelopeId?: string;
}

interface LedgerOutcome {
  result: TransactionResult;
  /** True when the key was seen before and no pipeline ran. */
  replay: boolean;
}

interface ScheduleRef {
  id: string;
  envelopeId: string | null;
  accountId: string;
}

const INSERT_SAVEPOINT = "orbit_ledger_insert";

const REUSED_KEY_MESSAGE = "That request was already used for a different amount.";

export class TransactionService extends BaseService {
  constructor() {
    super("TransactionService");
  }

  async createPurchase(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    amountCents: number;
    idempotencyKey?: string;
    memo?: string;
    /** Test/support override for the tenant-local booked date. */
    asOfDate?: string;
  }): Promise<TransactionResult> {
    if (!canSpend(input.role)) {
      throw new Error("Forbidden");
    }
    this.assertPositive(input.amountCents);
    return this.post({
      kind: "purchase",
      tenantId: input.tenantId,
      userId: input.userId,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
      memo: input.memo ?? "Purchase",
      asOfDate: input.asOfDate,
    });
  }

  /** A deposit. Owner and admin only. Settles the named payday, or a matching one due today. */
  async recordInflow(
    input: RecordInflowBody & {
      tenantId: string;
      userId: string;
      role: MembershipRole;
      asOfDate?: string;
    },
  ): Promise<TransactionResult> {
    if (!canConfigure(input.role)) {
      throw new Error("Forbidden");
    }
    this.assertPositive(input.amountCents);
    return this.post({
      kind: "inflow",
      tenantId: input.tenantId,
      userId: input.userId,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
      memo: input.memo ?? "Deposit",
      bookedDate: input.bookedDate,
      asOfDate: input.asOfDate,
      accountId: input.accountId,
      scheduleId: input.scheduleId,
    });
  }

  /** A bill paid from the bank. Owner and admin only. Advances the named bill schedule. */
  async recordOutflow(
    input: RecordOutflowBody & {
      tenantId: string;
      userId: string;
      role: MembershipRole;
      asOfDate?: string;
    },
  ): Promise<TransactionResult> {
    if (!canConfigure(input.role)) {
      throw new Error("Forbidden");
    }
    this.assertPositive(input.amountCents);
    return this.post({
      kind: "outflow",
      tenantId: input.tenantId,
      userId: input.userId,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
      memo: input.memo ?? "Payment",
      bookedDate: input.bookedDate,
      asOfDate: input.asOfDate,
      accountId: input.accountId,
      scheduleId: input.scheduleId,
      envelopeId: input.envelopeId,
    });
  }

  private assertPositive(amountCents: number): void {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new Error("Amount must be positive");
    }
  }

  /**
   * One ledger write: lock the tenant, insert, move the bank balance, settle, and publish,
   * all in one transaction (D13). The run row is opened first on its own connection.
   */
  private async post(input: PostInput): Promise<TransactionResult> {
    const transactionId = randomUUID();
    const signedCents = input.kind === "inflow" ? input.amountCents : -input.amountCents;

    return withPipelineRun(
      {
        tenantId: input.tenantId,
        trigger: "sync",
        asOfDate: input.asOfDate,
        transactionId,
        triggeredByUserId: input.userId,
      },
      async (run) => {
        const outcome = await withTransaction<LedgerOutcome>(
          { tenantId: input.tenantId, userId: input.userId },
          async (client) => {
            await lockTenantForUpdate(client, input.tenantId);

            const existing = await this.findReplay(client, input, signedCents);
            if (existing) return existing;

            const today = run.asOfDate;
            const bookedDate = input.bookedDate ?? today;
            if (bookedDate > today) {
              throw new ValidationError("The date can't be in the future.");
            }

            const schedule = input.scheduleId
              ? await this.loadSchedule(client, input)
              : null;
            const accountId = await this.resolveAccountId(client, input, schedule);
            const envelopeId = await this.resolveEnvelopeId(client, input, schedule);

            const inserted = await this.insertLedgerRow(client, {
              input,
              transactionId,
              accountId,
              envelopeId,
              signedCents,
              bookedDate,
            });
            if (inserted.replay) return inserted.replay;

            await client.query(
              `UPDATE accounts
               SET current_balance = current_balance + $1, updated_at = NOW()
               WHERE id = $2 AND tenant_id = $3`,
              [fromCents(signedCents), accountId, input.tenantId],
            );

            const pipeline = await runEvaluationPipeline(client, {
              tenantId: input.tenantId,
              userId: input.userId,
              trigger: "sync",
              transactionId,
              asOfDate: today,
              runId: run.runId,
              runPreStarted: true,
              advanceScheduleId: schedule?.id,
            });

            this.logInfo("Ledger transaction recorded", {
              tenantId: input.tenantId,
              kind: input.kind,
              amountCents: input.amountCents,
            });

            return {
              result: { id: transactionId, sTodayCents: pipeline.sTodayCents },
              replay: false,
            };
          },
        );

        if (outcome.replay) {
          // Nothing was evaluated, so there is no run to keep.
          await discardPipelineRun(run.runId);
        }
        return outcome.result;
      },
    );
  }

  /** Same key, same amount: hand back the first result. Same key, other amount: 409. */
  private async findReplay(
    client: PoolClient,
    input: PostInput,
    signedCents: number,
  ): Promise<LedgerOutcome | null> {
    const existing = await client.query<{ id: string; amount: string }>(
      `SELECT id, amount::text FROM transactions
       WHERE tenant_id = $1 AND idempotency_key = $2`,
      [input.tenantId, input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) return null;
    if (toCents(row.amount) !== signedCents) {
      throw new ConflictError(REUSED_KEY_MESSAGE);
    }
    this.logInfo("Ledger idempotency hit", {
      tenantId: input.tenantId,
      transactionId: row.id,
      kind: input.kind,
      idempotencyHit: true,
    });
    const allowance = await client.query<{ s_today: string }>(
      `SELECT s_today::text FROM allowance_snapshots WHERE tenant_id = $1`,
      [input.tenantId],
    );
    return {
      result: {
        id: row.id,
        sTodayCents: allowance.rows[0] ? toCents(allowance.rows[0].s_today) : null,
      },
      replay: true,
    };
  }

  private async insertLedgerRow(
    client: PoolClient,
    args: {
      input: PostInput;
      transactionId: string;
      accountId: string;
      envelopeId: string | null;
      signedCents: number;
      bookedDate: string;
    },
  ): Promise<{ replay: LedgerOutcome | null }> {
    const { input } = args;
    await client.query(`SAVEPOINT ${INSERT_SAVEPOINT}`);
    try {
      await client.query(
        `INSERT INTO transactions
           (id, tenant_id, account_id, envelope_id, amount, booked_at, booked_date, memo, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9)`,
        [
          args.transactionId,
          input.tenantId,
          args.accountId,
          args.envelopeId,
          fromCents(args.signedCents),
          new Date().toISOString(),
          args.bookedDate,
          input.memo,
          input.idempotencyKey,
        ],
      );
      await client.query(`RELEASE SAVEPOINT ${INSERT_SAVEPOINT}`);
      return { replay: null };
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      // A concurrent request won the key. Read what it wrote instead of failing.
      await client.query(`ROLLBACK TO SAVEPOINT ${INSERT_SAVEPOINT}`);
      const replay = await this.findReplay(client, input, args.signedCents);
      if (!replay) throw new ConflictError("That request is already being processed.");
      return { replay };
    }
  }

  private async loadSchedule(client: PoolClient, input: PostInput): Promise<ScheduleRef> {
    const result = await client.query<{
      id: string;
      envelope_id: string | null;
      account_id: string;
      direction: "inflow" | "outflow";
    }>(
      `SELECT id, envelope_id, account_id, direction
       FROM scheduled_schedules
       WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
      [input.scheduleId, input.tenantId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError("Schedule not found");
    const expected = input.kind === "inflow" ? "inflow" : "outflow";
    if (row.direction !== expected) {
      throw new ValidationError("That schedule is the other direction.");
    }
    return { id: row.id, envelopeId: row.envelope_id, accountId: row.account_id };
  }

  private async resolveAccountId(
    client: PoolClient,
    input: PostInput,
    schedule: ScheduleRef | null,
  ): Promise<string> {
    if (input.accountId) {
      const named = await client.query<{ id: string }>(
        `SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2`,
        [input.accountId, input.tenantId],
      );
      if (!named.rows[0]) throw new NotFoundError("Account not found");
      return named.rows[0].id;
    }
    if (schedule && input.kind !== "purchase") {
      return schedule.accountId;
    }
    const everyday = await client.query<{ id: string }>(
      `SELECT id FROM accounts WHERE tenant_id = $1 ORDER BY is_everyday DESC LIMIT 1`,
      [input.tenantId],
    );
    const id = everyday.rows[0]?.id;
    if (!id) throw new ValidationError("Add a bank account first.");
    return id;
  }

  /** Purchases hit Spending, inflows have no envelope (the waterfall assigns them), outflows hit a bill. */
  private async resolveEnvelopeId(
    client: PoolClient,
    input: PostInput,
    schedule: ScheduleRef | null,
  ): Promise<string | null> {
    if (input.kind === "inflow") return null;

    if (input.kind === "purchase") {
      const spending = await client.query<{ id: string }>(
        `SELECT id FROM envelopes
         WHERE tenant_id = $1 AND tier_category = 'discretionary' LIMIT 1`,
        [input.tenantId],
      );
      const id = spending.rows[0]?.id;
      if (!id) throw new ValidationError("No spending envelope");
      return id;
    }

    const wanted = schedule?.envelopeId ?? input.envelopeId;
    if (!wanted) throw new ValidationError("Choose which bill this pays.");
    const envelope = await client.query<{ id: string }>(
      `SELECT id FROM envelopes WHERE id = $1 AND tenant_id = $2`,
      [wanted, input.tenantId],
    );
    if (!envelope.rows[0]) throw new NotFoundError("Envelope not found");
    return envelope.rows[0].id;
  }
}

export const transactionService = new TransactionService();
