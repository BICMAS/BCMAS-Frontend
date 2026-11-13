type RoutePlaceholderProps = {
  title: string;
  description?: string;
};

/**
 * Temporary placeholder until the HTML screen is migrated.
 * Server Component friendly.
 */
export function RoutePlaceholder({
  title,
  description = "Screen migration pending. This route is reserved per the approved ROUTE_MAP.",
}: RoutePlaceholderProps) {
  return (
    <main className="flex flex-1 flex-col items-start justify-center gap-3 bg-bg-slate p-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-slate">
        BCMS
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-navy">{title}</h1>
      <p className="max-w-xl text-sm leading-relaxed text-slate-500">{description}</p>
    </main>
  );
}
