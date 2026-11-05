import { config } from "dotenv";
import { HARBOR } from "../lib/dev/harbor-ids";
import { getPool, getUnpooledPool, withTransaction } from "../lib/db/connection";
import { runEvaluationPipeline } from "../lib/pipeline/run-evaluation";
import { logger } from "../lib/logger";

config({ path: ".env" });

async function main(): Promise<void> {
  await withTransaction(
    { tenantId: HARBOR.tenantId, userId: HARBOR.alexId },
    async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      await runEvaluationPipeline(client, {
        tenantId: HARBOR.tenantId,
        userId: HARBOR.alexId,
        trigger: "sync",
        asOfDate: "2026-11-04",
      });
    },
    { unpooled: true },
  );
  logger.info("Forecast refreshed for Harbor");
  await getUnpooledPool().end();
  await getPool().end();
}

main().catch((error: unknown) => {
  logger.error("Refresh failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  process.exit(1);
});
