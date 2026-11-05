"use client";

import { HARBOR } from "@/lib/dev/harbor-ids";

export type ActorKey = "blair" | "alex" | "casey";

export interface ActorChoice {
  key: ActorKey;
  userId: string;
  label: string;
  role: string;
}

export const ACTORS: ActorChoice[] = [
  { key: "blair", userId: HARBOR.blairId, label: "Blair", role: "member" },
  { key: "alex", userId: HARBOR.alexId, label: "Alex", role: "owner" },
  { key: "casey", userId: HARBOR.caseyId, label: "Casey", role: "advisor" },
];

const STORAGE_KEY = "orbit-actor";
const TENANT_KEY = "orbit-tenant";

export function getActorUserId(): string {
  if (typeof window === "undefined") return HARBOR.blairId;
  return window.localStorage.getItem(STORAGE_KEY) ?? HARBOR.blairId;
}

export function getTenantId(): string {
  if (typeof window === "undefined") return HARBOR.tenantId;
  return window.localStorage.getItem(TENANT_KEY) ?? HARBOR.tenantId;
}

export function setActorUserId(userId: string): void {
  window.localStorage.setItem(STORAGE_KEY, userId);
}

export function setTenantId(tenantId: string): void {
  window.localStorage.setItem(TENANT_KEY, tenantId);
}
