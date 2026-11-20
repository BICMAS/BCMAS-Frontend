"use client";

import { useEffect, useState } from "react";

import { createAssessmentDelivery, type AssessmentDelivery } from "../../delivery";

/** The assessment delivery adapter (injected in tests; created for the configured mode otherwise). */
export function useAssessmentDelivery(injected?: AssessmentDelivery): AssessmentDelivery | null {
  const [created, setCreated] = useState<AssessmentDelivery | null>(null);
  useEffect(() => {
    if (injected) return;
    let cancelled = false;
    void createAssessmentDelivery().then((delivery) => {
      if (!cancelled) setCreated(delivery);
    });
    return () => {
      cancelled = true;
    };
  }, [injected]);
  return injected ?? created;
}
