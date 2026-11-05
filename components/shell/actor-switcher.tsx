"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { isClientDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { ACTORS, getActorUserId, setActorUserId } from "@/lib/dev/actor-store";
import { cn } from "@/lib/utils";

export interface ActorSwitcherProps {
  className?: string;
}

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Local Harbor actor switching. Renders nothing unless dev header auth is on. */
export function ActorSwitcher({ className }: ActorSwitcherProps) {
  const queryClient = useQueryClient();
  const stored = useSyncExternalStore(subscribeStorage, getActorUserId, () => ACTORS[0].userId);
  const [picked, setPicked] = useState<string | null>(null);
  const userId = picked ?? stored;

  if (!isClientDevHeaderAuthEnabled()) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {ACTORS.map((actor) => (
        <button
          key={actor.key}
          type="button"
          onClick={() => {
            setActorUserId(actor.userId);
            setPicked(actor.userId);
            void queryClient.invalidateQueries();
          }}
          className={cn(
            "text-[13px]",
            userId === actor.userId
              ? "text-[var(--orbit-ink)]"
              : "text-[var(--orbit-secondary)]",
          )}
        >
          {actor.label}
          <span className="text-[var(--orbit-secondary)]"> · {actor.role}</span>
        </button>
      ))}
    </div>
  );
}
