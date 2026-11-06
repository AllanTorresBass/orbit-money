import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/api-error";
import {
  countPendingPurchases,
  countPoisonPurchases,
  discardPoisonPurchases,
  enqueuePurchase,
  flushPurchaseQueue,
  listQueuedPurchases,
  MAX_QUEUE_FAILURES,
} from "@/lib/offline/purchase-queue";
import { isPurchaseRejection } from "@/lib/utils/queued-purchase";

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const alex = { tenantId: "t1", userId: "alex" };
const blair = { tenantId: "t1", userId: "blair" };
const otherHome = { tenantId: "t2", userId: "alex" };

function stubWindow(): void {
  const target = { localStorage: new MemoryStorage(), dispatchEvent: () => true };
  Object.defineProperty(globalThis, "window", { value: target, configurable: true });
}

function add(scope: typeof alex, cents: number) {
  return enqueuePurchase(scope, { amountCents: cents, idempotencyKey: `k-${cents}` });
}

describe("offline purchase queue", () => {
  beforeEach(() => {
    stubWindow();
  });

  it("keeps one queue per household and person", () => {
    add(alex, 100);
    add(blair, 200);
    add(otherHome, 300);
    expect(listQueuedPurchases(alex).map((i) => i.amountCents)).toEqual([100]);
    expect(listQueuedPurchases(blair).map((i) => i.amountCents)).toEqual([200]);
    expect(listQueuedPurchases(otherHome).map((i) => i.amountCents)).toEqual([300]);
  });

  it("flushes in order and removes what was sent", async () => {
    add(alex, 100);
    add(alex, 200);
    const sent: number[] = [];
    const result = await flushPurchaseQueue(
      alex,
      async (item) => {
        sent.push(item.amountCents);
      },
      isPurchaseRejection,
    );
    expect(sent).toEqual([100, 200]);
    expect(result).toEqual({ flushed: 2, remaining: 0, poisoned: 0 });
  });

  it("stops without counting a failure when the network is down", async () => {
    add(alex, 100);
    add(alex, 200);
    const result = await flushPurchaseQueue(
      alex,
      async () => {
        throw new Error("Failed to fetch");
      },
      isPurchaseRejection,
    );
    expect(result.flushed).toBe(0);
    expect(result.remaining).toBe(2);
    expect(listQueuedPurchases(alex).every((i) => i.failures === 0)).toBe(true);
  });

  it("skips a rejected purchase, sends the rest, and gives up after repeated rejections", async () => {
    add(alex, 100); // the server will always refuse this one
    add(alex, 200);
    const refuse = new ApiError("Amount mismatch", { status: 409 });

    let last = { flushed: 0, remaining: 0, poisoned: 0 };
    for (let attempt = 0; attempt < MAX_QUEUE_FAILURES; attempt += 1) {
      last = await flushPurchaseQueue(
        alex,
        async (item) => {
          if (item.amountCents === 100) throw refuse;
        },
        isPurchaseRejection,
      );
    }
    // The good purchase went out on the first pass; the bad one is now poison.
    expect(last).toEqual({ flushed: 0, remaining: 0, poisoned: 1 });
    expect(countPendingPurchases(alex)).toBe(0);
    expect(countPoisonPurchases(alex)).toBe(1);

    // A poison purchase is never retried.
    let calls = 0;
    await flushPurchaseQueue(
      alex,
      async () => {
        calls += 1;
      },
      isPurchaseRejection,
    );
    expect(calls).toBe(0);

    discardPoisonPurchases(alex);
    expect(listQueuedPurchases(alex)).toEqual([]);
  });

  it("stores the booked date when saving and sends it on flush", async () => {
    enqueuePurchase(alex, { amountCents: 100, idempotencyKey: "k1", bookedDate: "2026-11-04" });
    enqueuePurchase(alex, { amountCents: 200, idempotencyKey: "k2" });
    const [first, second] = listQueuedPurchases(alex);
    expect(first.bookedDate).toBe("2026-11-04");
    // Without a household date the device's local day is fixed at save time.
    expect(second.bookedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const sent: Array<string | undefined> = [];
    await flushPurchaseQueue(
      alex,
      async (item) => {
        sent.push(item.bookedDate);
      },
      isPurchaseRejection,
    );
    expect(sent[0]).toBe("2026-11-04");
    expect(sent[1]).toBe(second.bookedDate);
  });

  it("reads an item saved before bookedDate existed without a date", () => {
    const key = "orbit.offline.purchases:t1:alex";
    window.localStorage.setItem(
      key,
      JSON.stringify([
        { id: "i1", amountCents: 50, idempotencyKey: "old", createdAt: "2026-11-01T00:00:00Z" },
      ]),
    );
    expect(listQueuedPurchases(alex)[0].bookedDate).toBeUndefined();
  });

  it("treats sign-in and rate-limit errors as retryable, not as rejections", () => {
    expect(isPurchaseRejection(new ApiError("x", { status: 401 }))).toBe(false);
    expect(isPurchaseRejection(new ApiError("x", { status: 429 }))).toBe(false);
    expect(isPurchaseRejection(new ApiError("x", { status: 500 }))).toBe(false);
    expect(isPurchaseRejection(new ApiError("x", { status: 400 }))).toBe(true);
    expect(isPurchaseRejection(new Error("Failed to fetch"))).toBe(false);
  });
});
