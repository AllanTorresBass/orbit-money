import type {
  OfflineQueueScope,
  QueuedPurchase,
} from "@/types/transactions/transaction.types";

export type { OfflineQueueScope, QueuedPurchase };

const KEY_PREFIX = "orbit.offline.purchases";

/** After this many rejections a purchase stops retrying and waits for the person. */
export const MAX_QUEUE_FAILURES = 5;

/** Fired on this tab whenever a queue changes. Other tabs fire the native `storage` event. */
export const PURCHASE_QUEUE_EVENT = "orbit:purchase-queue";

/** One queue per household and person, so a purchase never lands in the wrong place. */
function storageKey(scope: OfflineQueueScope): string {
  return `${KEY_PREFIX}:${scope.tenantId}:${scope.userId}`;
}

function isQueuedPurchase(value: unknown): value is QueuedPurchase {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.amountCents === "number" &&
    typeof row.idempotencyKey === "string" &&
    typeof row.createdAt === "string"
  );
}

function readQueue(scope: OfflineQueueScope): QueuedPurchase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedPurchase).map((item) => {
      const failures = (item as { failures?: unknown }).failures;
      return { ...item, failures: typeof failures === "number" ? failures : 0 };
    });
  } catch {
    return [];
  }
}

function writeQueue(scope: OfflineQueueScope, items: QueuedPurchase[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(scope), JSON.stringify(items));
  window.dispatchEvent(new Event(PURCHASE_QUEUE_EVENT));
}

export function isPoisonPurchase(item: QueuedPurchase): boolean {
  return item.failures >= MAX_QUEUE_FAILURES;
}

export function enqueuePurchase(
  scope: OfflineQueueScope,
  input: { amountCents: number; idempotencyKey: string; memo?: string },
): QueuedPurchase {
  const item: QueuedPurchase = {
    id: crypto.randomUUID(),
    amountCents: input.amountCents,
    idempotencyKey: input.idempotencyKey,
    memo: input.memo,
    createdAt: new Date().toISOString(),
    failures: 0,
  };
  writeQueue(scope, [...readQueue(scope), item]);
  return item;
}

/** Every saved purchase, poison included. */
export function listQueuedPurchases(scope: OfflineQueueScope): QueuedPurchase[] {
  return readQueue(scope);
}

/** Purchases still waiting to send. */
export function countPendingPurchases(scope: OfflineQueueScope): number {
  return readQueue(scope).filter((item) => !isPoisonPurchase(item)).length;
}

/** Purchases the server kept turning away. They never retry on their own. */
export function countPoisonPurchases(scope: OfflineQueueScope): number {
  return readQueue(scope).filter(isPoisonPurchase).length;
}

export function removeQueuedPurchase(scope: OfflineQueueScope, id: string): void {
  writeQueue(
    scope,
    readQueue(scope).filter((item) => item.id !== id),
  );
}

/** Drop the purchases that gave up, after the person has seen the banner. */
export function discardPoisonPurchases(scope: OfflineQueueScope): void {
  writeQueue(scope, readQueue(scope).filter((item) => !isPoisonPurchase(item)));
}

function recordFailure(scope: OfflineQueueScope, id: string): void {
  writeQueue(
    scope,
    readQueue(scope).map((item) =>
      item.id === id ? { ...item, failures: item.failures + 1 } : item,
    ),
  );
}

export interface FlushResult {
  flushed: number;
  /** Still waiting to send. */
  remaining: number;
  /** Gave up after repeated rejections. */
  poisoned: number;
}

/**
 * Send queued purchases in order.
 * - Success removes the item.
 * - A rejection (`isRejection` true) counts a failure and moves on, so one bad purchase
 *   cannot block the rest. After `MAX_QUEUE_FAILURES` it is skipped for good.
 * - Anything else (offline, server down, signed out) stops the flush and counts nothing.
 */
export async function flushPurchaseQueue(
  scope: OfflineQueueScope,
  send: (item: QueuedPurchase) => Promise<void>,
  isRejection: (error: unknown) => boolean,
): Promise<FlushResult> {
  let flushed = 0;
  for (const item of readQueue(scope)) {
    if (isPoisonPurchase(item)) continue;
    try {
      await send(item);
      removeQueuedPurchase(scope, item.id);
      flushed += 1;
    } catch (error: unknown) {
      if (!isRejection(error)) break;
      recordFailure(scope, item.id);
    }
  }
  return {
    flushed,
    remaining: countPendingPurchases(scope),
    poisoned: countPoisonPurchases(scope),
  };
}
