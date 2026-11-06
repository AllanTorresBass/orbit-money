"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";

/** Recent pipeline runs (+ latest overnight batch). Owners/admins only. */
export function usePipelineRuns(enabled: boolean, limit = 10) {
  return useQuery({
    queryKey: queryKeys.pipeline.list(limit),
    queryFn: async () => api.getPipelineRuns({ limit }),
    enabled,
    retry: false,
  });
}

/** One run with its steps. Pass null to stay idle until a row is opened. */
export function usePipelineRun(id: string | null) {
  return useQuery({
    queryKey: queryKeys.pipeline.detail(id ?? ""),
    queryFn: async () => (await api.getPipelineRun(id ?? "")).run,
    enabled: id !== null,
    retry: false,
  });
}
