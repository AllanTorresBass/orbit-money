import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

/** Everything a money change can move: the number, the forecast, the plan, the bank. */
export async function invalidateMoneyQueries(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.allowance.all }),
    client.invalidateQueries({ queryKey: queryKeys.forecast.all }),
    client.invalidateQueries({ queryKey: queryKeys.plan.all }),
    client.invalidateQueries({ queryKey: queryKeys.accounts.all }),
  ]);
}
