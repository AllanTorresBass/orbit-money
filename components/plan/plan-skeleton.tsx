import { cn } from "@/lib/utils";

export interface PlanSkeletonProps {
  className?: string;
}

export function PlanSkeleton({ className }: PlanSkeletonProps) {
  return (
    <div className={cn("mx-auto max-w-md animate-pulse px-6 pt-8", className)} aria-busy="true">
      <div className="h-8 w-28 rounded bg-[var(--orbit-line)]" />
      <div className="mt-3 h-4 w-48 rounded bg-[var(--orbit-line)]" />
      <div className="mt-10 h-4 w-16 rounded bg-[var(--orbit-line)]" />
      <div className="mt-3 space-y-3">
        <div className="h-10 w-full rounded bg-[var(--orbit-line)]" />
        <div className="h-10 w-full rounded bg-[var(--orbit-line)]" />
      </div>
      <div className="mt-8 h-4 w-16 rounded bg-[var(--orbit-line)]" />
      <div className="mt-3 space-y-3">
        <div className="h-10 w-full rounded bg-[var(--orbit-line)]" />
        <div className="h-10 w-full rounded bg-[var(--orbit-line)]" />
      </div>
    </div>
  );
}
