export interface QueuedPurchase {
  id: string;
  amountCents: number;
  idempotencyKey: string;
  memo?: string;
  createdAt: string;
}

const STORAGE_KEY = "orbit.offline.purchases";

/** Fired on this tab whenever the queue changes. Other tabs fire the native `storage` event. */
export const PURCHASE_QUEUE_EVENT = "orbit:purchase-queue";

function readQueue(): QueuedPurchase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedPurchase);
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedPurchase[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(PURCHASE_QUEUE_EVENT));
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

export function enqueuePurchase(input: {
  amountCents: number;
  idempotencyKey: string;
  memo?: string;
}): QueuedPurchase {
  const item: QueuedPurchase = {
    id: crypto.randomUUID(),
    amountCents: input.amountCents,
    idempotencyKey: input.idempotencyKey,
    memo: input.memo,
    createdAt: new Date().toISOString(),
  };
  const next = [...readQueue(), item];
  writeQueue(next);
  return item;
}

export function listQueuedPurchases(): QueuedPurchase[] {
  return readQueue();
}

export function removeQueuedPurchase(id: string): void {
  writeQueue(readQueue().filter((item) => item.id !== id));
}

export async function flushPurchaseQueue(
  send: (item: QueuedPurchase) => Promise<void>,
): Promise<{ flushed: number; remaining: number }> {
  const queue = readQueue();
  let flushed = 0;
  for (const item of queue) {
    try {
      await send(item);
      removeQueuedPurchase(item.id);
      flushed += 1;
    } catch {
      // Keep remaining items for the next online attempt.
      break;
    }
  }
  return { flushed, remaining: listQueuedPurchases().length };
}
