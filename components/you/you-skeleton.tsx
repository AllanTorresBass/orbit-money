import { cn } from "@/lib/utils";

export interface YouSkeletonProps {
  className?: string;
}

export function YouSkeleton({ className }: YouSkeletonProps) {
  return (
    <div className={cn("mx-auto max-w-md animate-pulse px-5 pt-8", className)} aria-busy="true">
      <div className="h-4 w-12 rounded-xl bg-[var(--orbit-line)]" />
      <div className="mt-4 h-8 w-20 rounded-xl bg-[var(--orbit-line)]" />
      <div className="mt-6 h-28 rounded-[1.25rem] bg-[var(--orbit-line)]" />
      <div className="mt-10 space-y-3">
        <div className="h-8 w-full rounded-xl bg-[var(--orbit-line)]" />
        <div className="h-8 w-full rounded-xl bg-[var(--orbit-line)]" />
      </div>
    </div>
  );
}
