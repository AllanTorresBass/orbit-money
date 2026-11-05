export const queryKeys = {
  me: {
    all: ["me"] as const,
  },
  allowance: {
    all: ["allowance"] as const,
    current: () => [...queryKeys.allowance.all, "current"] as const,
  },
  forecast: {
    all: ["forecast"] as const,
    list: () => [...queryKeys.forecast.all, "list"] as const,
  },
  plan: {
    all: ["plan"] as const,
    current: () => [...queryKeys.plan.all, "current"] as const,
  },
};
