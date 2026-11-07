import { cn } from "@/lib/utils";

export interface TodaySkeletonProps {
  className?: string;
}

export function TodaySkeleton({ className }: TodaySkeletonProps) {
  return (
    <div className={cn("mx-auto max-w-md animate-pulse px-5 pt-8", className)}>
      <div className="h-8 w-40 rounded-xl bg-[var(--orbit-line)]" />
      <div className="mt-16 h-4 w-28 rounded-xl bg-[var(--orbit-line)]" />
      <div className="mt-4 h-16 w-56 rounded-xl bg-[var(--orbit-line)]" />
      <div className="mt-4 h-4 w-48 rounded-xl bg-[var(--orbit-line)]" />
      <div className="mt-10 h-12 w-full rounded-xl bg-[var(--orbit-line)]" />
    </div>
  );
}
