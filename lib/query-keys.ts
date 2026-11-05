export const queryKeys = {
  me: {
    all: ["me"] as const,
    invites: () => [...queryKeys.me.all, "invites"] as const,
  },
  allowance: {
    all: ["allowance"] as const,
    current: () => [...queryKeys.allowance.all, "current"] as const,
  },
  forecast: {
    all: ["forecast"] as const,
    list: () => [...queryKeys.forecast.all, "list"] as const,
    details: () => [...queryKeys.forecast.all, "detail"] as const,
    detail: (date: string) => [...queryKeys.forecast.details(), date] as const,
  },
  plan: {
    all: ["plan"] as const,
    current: () => [...queryKeys.plan.all, "current"] as const,
  },
  people: {
    all: ["people"] as const,
    list: () => [...queryKeys.people.all, "list"] as const,
  },
  accounts: {
    all: ["accounts"] as const,
    list: () => [...queryKeys.accounts.all, "list"] as const,
  },
  proposals: {
    all: ["proposals"] as const,
    list: () => [...queryKeys.proposals.all, "list"] as const,
  },
};
