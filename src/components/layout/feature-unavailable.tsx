import Link from "next/link";
import { LockIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PageUnavailableProps = {
  title: string;
  message: string;
  homeHref: string;
};

/** Shown instead of a page the current person may not open. */
export function PageUnavailable({ title, message, homeHref }: PageUnavailableProps) {
  return (
    <section
      aria-labelledby="feature-unavailable-title"
      className="mx-auto mt-10 max-w-lg rounded-2xl border border-border-slate bg-white p-10 text-center shadow-sm"
    >
      <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full border border-border-slate bg-slate-50 text-slate-500">
        <LockIcon className="size-7" aria-hidden />
      </div>
      <h1 id="feature-unavailable-title" className="text-2xl font-bold tracking-tight text-navy">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-500">{message}</p>
      <Link href={homeHref} className={cn(buttonVariants({ variant: "default" }), "mt-8")}>
        Go to your home page
      </Link>
    </section>
  );
}

type FeatureUnavailableProps = {
  feature: string;
  organisationName: string;
  homeHref: string;
};

/** Shown instead of a page whose feature is switched off for the current tenant. */
export function FeatureUnavailable({ feature, organisationName, homeHref }: FeatureUnavailableProps) {
  return (
    <PageUnavailable
      title={`${feature} isn't enabled`}
      message={`${feature} is not part of ${organisationName}'s subscription. Ask your Organisation Admin to contact BICMAS if you need it.`}
      homeHref={homeHref}
    />
  );
}
