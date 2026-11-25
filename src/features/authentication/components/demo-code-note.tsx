/** Sample data: stands in for the email. The backend sends it and never returns the code. */
export function DemoCodeNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="note" className="rounded-lg border border-dashed border-amber-500 bg-amber-50 px-4 py-2 text-xs text-amber-800">
      {children}
    </p>
  );
}
