"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ACTORS, getActorUserId, setActorUserId } from "@/lib/dev/actor-store";
import { cn } from "@/lib/utils";

export interface ActorSwitcherProps {
  className?: string;
}

export function ActorSwitcher({ className }: ActorSwitcherProps) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState(ACTORS[0].userId);

  useEffect(() => {
    setUserId(getActorUserId());
  }, []);

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {ACTORS.map((actor) => (
        <button
          key={actor.key}
          type="button"
          onClick={() => {
            setActorUserId(actor.userId);
            setUserId(actor.userId);
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
