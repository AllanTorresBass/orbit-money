import { getActorUserId, getTenantId } from "@/lib/dev/actor-store";

export interface ApiClientOptions {
  userId?: string;
  tenantId?: string;
}

async function apiFetch<T>(path: string, init?: RequestInit, options?: ApiClientOptions): Promise<T> {
  const userId = options?.userId ?? getActorUserId();
  const tenantId = options?.tenantId ?? getTenantId();
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userId,
      "x-tenant-id": tenantId,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({ error: "Request failed" }));
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : "Request failed";
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getMe: () =>
    apiFetch<{
      userId: string;
      tenantId: string;
      role: string;
      name: string;
      tenantName: string;
      canSpend: boolean;
    }>("/api/v1/me"),
  getAllowance: () =>
    apiFetch<{
      sTodayCents: number;
      sDailyCents: number;
      nP: number;
      nextPayday: string | null;
      mitigated: boolean;
      tenantName: string;
      breachDate: string | null;
      warningDate: string | null;
    }>("/api/v1/allowance"),
  getForecast: () =>
    apiFetch<{
      days: Array<{
        dayOffset: number;
        forecastDate: string;
        balanceCents: number;
        status: string;
        assumedBurnCents: number;
      }>;
    }>("/api/v1/forecast"),
  getPlan: () =>
    apiFetch<{
      bills: Array<{
        id: string;
        name: string;
        balanceCents: number;
        targetCapCents: number | null;
        monthlyInstallmentCents: number | null;
      }>;
      goals: Array<{
        id: string;
        name: string;
        balanceCents: number;
        targetCapCents: number | null;
        monthlyInstallmentCents: number | null;
      }>;
      spending: { id: string; name: string; balanceCents: number } | null;
      recentPurchases: Array<{ id: string; amountCents: number; memo: string | null }>;
    }>("/api/v1/plan"),
  createPurchase: (body: { amountCents: number; idempotencyKey?: string; memo?: string }) =>
    apiFetch<{ id: string; sTodayCents: number | null }>("/api/v1/transactions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createTenant: (body: {
    name: string;
    tenantType: "individual" | "household" | "organization";
    ownerEmail: string;
    ownerName: string;
    timezone: string;
    paydayAmountCents: number;
    nextPayday: string;
    rrule: string;
  }) =>
    apiFetch<{ tenantId: string; userId: string }>("/api/v1/tenants", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getPeople: () =>
    apiFetch<{
      people: Array<{ userId: string; name: string; email: string; role: string; status: string }>;
    }>("/api/v1/people"),
  updateFloor: (floorCents: number) =>
    apiFetch<{ floorCents: number }>("/api/v1/settings/floor", {
      method: "PATCH",
      body: JSON.stringify({ floorCents }),
    }),
  createEnvelope: (body: {
    name: string;
    tierCategory: "fixed" | "sinking";
    targetCapCents: number | null;
    monthlyInstallmentCents: number | null;
    dueDate?: string | null;
    amountEachPaydayCents?: number | null;
  }) =>
    apiFetch<{ id?: string; proposalId?: string }>("/api/v1/envelopes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateEnvelope: (
    id: string,
    body: {
      name: string;
      tierCategory: "fixed" | "sinking";
      targetCapCents: number | null;
      monthlyInstallmentCents: number | null;
      dueDate?: string | null;
      amountEachPaydayCents?: number | null;
    },
  ) =>
    apiFetch<{ id?: string; proposalId?: string }>(`/api/v1/envelopes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getProposals: () =>
    apiFetch<{
      proposals: Array<{
        id: string;
        proposedByName: string;
        payload: { name: string; tierCategory: string; targetCapCents: number | null };
      }>;
    }>("/api/v1/proposals"),
  resolveProposal: (id: string, decision: "accepted" | "rejected") =>
    apiFetch<{ ok: boolean }>(`/api/v1/proposals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ decision }),
    }),
  invitePerson: (body: {
    email: string;
    name: string;
    role: "admin" | "member" | "advisor" | "read_only";
  }) =>
    apiFetch<{ userId: string; status: string }>("/api/v1/people/invite", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
