import { ApiError } from "@/lib/api/api-error";
import { isClientDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { getActorUserId, getTenantId } from "@/lib/dev/actor-store";
import type { AccountDto, AccountListResponse, CreateAccountBody } from "@/types/account/account.types";
import type { AllowanceDto } from "@/types/allowance/allowance.types";
import type {
  ForecastDayDetailDto,
  ForecastListResponse,
} from "@/types/forecast/forecast.types";
import type { MeDto, TenantChoice } from "@/types/me/me.types";
import type { PipelineRunListResponse, PipelineRunResponse } from "@/types/pipeline/pipeline.types";
import type {
  AcceptInviteBody,
  AssignableRole,
  InviteBody,
  InviteResult,
  PeopleListResponse,
  PendingInvitesResponse,
} from "@/types/people/people.types";
import type {
  EnvelopeMutationResult,
  EnvelopePayload,
  PlanDto,
  ProposalDecision,
  ProposalListResponse,
  ReorderEnvelopesBody,
} from "@/types/plan/plan.types";
import type {
  CreatePurchaseBody,
  RecordInflowBody,
  RecordOutflowBody,
  TransactionResult,
} from "@/types/transactions/transaction.types";
import type { CreateTenantBody, CreateTenantResult } from "@/types/tenant/tenant.types";

export interface ApiClientOptions {
  userId?: string;
  tenantId?: string;
}

interface ErrorBody {
  error?: unknown;
  code?: unknown;
  tenants?: unknown;
}

function isTenantChoice(value: unknown): value is TenantChoice {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).tenantId === "string" &&
    typeof (value as Record<string, unknown>).tenantName === "string"
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({ error: "Request failed" }))) as ErrorBody;
  const message = typeof body.error === "string" ? body.error : "Request failed";
  return new ApiError(message, {
    status: response.status,
    code: typeof body.code === "string" ? body.code : null,
    tenants: Array.isArray(body.tenants) ? body.tenants.filter(isTenantChoice) : [],
  });
}

async function apiFetch<T>(path: string, init?: RequestInit, options?: ApiClientOptions): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  // Production uses Auth.js cookies. Dev header impersonation is opt-in only.
  if (isClientDevHeaderAuthEnabled()) {
    headers["x-user-id"] = options?.userId ?? getActorUserId();
    headers["x-tenant-id"] = options?.tenantId ?? getTenantId();
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getMe: () => apiFetch<MeDto>("/api/v1/me"),
  getMyInvites: () => apiFetch<PendingInvitesResponse>("/api/v1/me/invites"),
  selectTenant: (tenantId: string) =>
    apiFetch<{ tenantId: string }>("/api/v1/me/tenant", {
      method: "POST",
      body: JSON.stringify({ tenantId }),
    }),
  getAllowance: () => apiFetch<AllowanceDto>("/api/v1/allowance"),
  getForecast: () => apiFetch<ForecastListResponse>("/api/v1/forecast"),
  getForecastDay: (date: string) =>
    apiFetch<ForecastDayDetailDto>(`/api/v1/forecast/${encodeURIComponent(date)}`),
  getPlan: () => apiFetch<PlanDto>("/api/v1/plan"),
  getPipelineRuns: (options?: { limit?: number; includeSteps?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.includeSteps) params.set("includeSteps", "1");
    const qs = params.toString();
    return apiFetch<PipelineRunListResponse>(`/api/v1/pipeline/runs${qs ? `?${qs}` : ""}`);
  },
  getPipelineRun: (id: string) =>
    apiFetch<PipelineRunResponse>(`/api/v1/pipeline/runs/${encodeURIComponent(id)}`),
  createPurchase: (body: CreatePurchaseBody) =>
    apiFetch<TransactionResult>("/api/v1/transactions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  recordInflow: (body: RecordInflowBody) =>
    apiFetch<TransactionResult>("/api/v1/transactions/inflow", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  recordOutflow: (body: RecordOutflowBody) =>
    apiFetch<TransactionResult>("/api/v1/transactions/outflow", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createTenant: (body: CreateTenantBody) =>
    apiFetch<CreateTenantResult>("/api/v1/tenants", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getPeople: () => apiFetch<PeopleListResponse>("/api/v1/people"),
  invitePerson: (body: InviteBody) =>
    apiFetch<InviteResult>("/api/v1/people/invite", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  acceptInvite: (body: AcceptInviteBody) =>
    apiFetch<InviteResult>("/api/v1/people/invite/accept", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePersonRole: (userId: string, role: AssignableRole) =>
    apiFetch<InviteResult>(`/api/v1/people/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  removePerson: (userId: string) =>
    apiFetch<InviteResult>(`/api/v1/people/${userId}`, { method: "DELETE" }),
  updateFloor: (floorCents: number) =>
    apiFetch<{ floorCents: number }>("/api/v1/settings/floor", {
      method: "PATCH",
      body: JSON.stringify({ floorCents }),
    }),
  createEnvelope: (body: EnvelopePayload) =>
    apiFetch<EnvelopeMutationResult>("/api/v1/envelopes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateEnvelope: (id: string, body: EnvelopePayload) =>
    apiFetch<EnvelopeMutationResult>(`/api/v1/envelopes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getProposals: () => apiFetch<ProposalListResponse>("/api/v1/proposals"),
  resolveProposal: (id: string, decision: ProposalDecision) =>
    apiFetch<{ ok: boolean }>(`/api/v1/proposals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ decision }),
    }),
  reorderEnvelopes: (body: ReorderEnvelopesBody) =>
    apiFetch<{ ok: boolean }>("/api/v1/envelopes/reorder", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getAccounts: () => apiFetch<AccountListResponse>("/api/v1/accounts"),
  createAccount: (body: CreateAccountBody) =>
    apiFetch<AccountDto>("/api/v1/accounts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAccountBalance: (id: string, balanceCents: number) =>
    apiFetch<AccountDto>(`/api/v1/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ balanceCents }),
    }),
};
