import { cn } from "@/lib/utils";

export interface AheadSkeletonProps {
  className?: string;
}

export function AheadSkeleton({ className }: AheadSkeletonProps) {
  return (
    <div className={cn("mx-auto max-w-md animate-pulse px-6 pt-8", className)}>
      <div className="h-8 w-32 rounded bg-[var(--orbit-line)]" />
      <div className="mt-10 h-40 w-full rounded bg-[var(--orbit-line)]" />
      <div className="mt-8 space-y-3">
        <div className="h-8 w-full rounded bg-[var(--orbit-line)]" />
        <div className="h-8 w-full rounded bg-[var(--orbit-line)]" />
        <div className="h-8 w-full rounded bg-[var(--orbit-line)]" />
      </div>
    </div>
  );
}
