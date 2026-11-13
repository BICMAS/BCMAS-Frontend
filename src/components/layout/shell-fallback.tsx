export function ShellFallback() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg-slate">
      <div className="h-16 border-b border-border-slate bg-white" />
      <div className="flex flex-1">
        <div className="hidden w-[var(--sidebar-width)] border-r border-border-slate bg-white lg:block" />
        <div className="flex-1 p-8">
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-4 w-96 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
