export default function InviteLoading() {
  return (
    <div className="mx-auto max-w-md animate-pulse px-5 pt-16" aria-busy="true">
      <div className="h-8 w-64 max-w-full rounded-xl bg-[var(--orbit-line)]" />
      <div className="mt-8 h-4 w-40 rounded-xl bg-[var(--orbit-line)]" />
      <div className="mt-3 h-4 w-56 max-w-full rounded-xl bg-[var(--orbit-line)]" />
      <div className="mt-10 h-12 w-full rounded-xl bg-[var(--orbit-line)]" />
    </div>
  );
}
