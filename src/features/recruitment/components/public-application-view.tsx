"use client";

import { BriefcaseIcon, CalendarIcon, CheckCircle2Icon, FileTextIcon, MapPinIcon, UploadIcon } from "lucide-react";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

import {
  CV_MAX_BYTES,
  RecruitmentError,
  getPublicVacancy,
  recruitmentRevision,
  submitApplication,
  subscribeRecruitment,
  validateApplication,
  type ApplicationInput,
} from "../services/vacancies";
import { extractCvText, rememberCvFile } from "../services/cv-text";
import { formatDate } from "./recruitment-shared";

type Errors = Partial<Record<keyof ApplicationInput, string>>;

/** Public, mobile-friendly application page. No BCMS login (guide §10). */
export function PublicApplicationView({ token }: { token: string }) {
  const revision = useSyncExternalStore(subscribeRecruitment, recruitmentRevision, () => 0);
  const vacancy = useMemo(() => {
    void revision;
    return getPublicVacancy(token);
  }, [token, revision]);
  const [step, setStep] = useState<"details" | "form" | "done">("details");
  const [form, setForm] = useState({ fullName: "", email: "", confirmEmail: "", phone: "" });
  const [cv, setCv] = useState<ApplicationInput["cv"]>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string; email: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!vacancy) {
    return (
      <Card>
        <h1 className="text-xl font-bold text-navy">Application link not found</h1>
        <p className="mt-2 text-sm text-slate-500">Please check the link you were given, or contact the organisation that shared it.</p>
      </Card>
    );
  }

  const input: ApplicationInput = { ...form, cv, consent, cvText };

  async function chooseFile(file: File) {
    setCv({ fileName: file.name, sizeBytes: file.size, mimeType: file.type });
    setCvFile(file);
    setCvText(null);
    setReading(true);
    try {
      setCvText(await extractCvText(file));
    } finally {
      setReading(false);
    }
  }
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function submit() {
    const found = validateApplication(input);
    setErrors(found);
    setSubmitError(null);
    if (Object.keys(found).length) return;
    try {
      const { reference, applicationId } = submitApplication(token, input);
      if (cvFile) rememberCvFile(applicationId, cvFile);
      setResult({ reference, email: form.email.trim().toLowerCase() });
      setStep("done");
    } catch (error) {
      setSubmitError(error instanceof RecruitmentError ? error.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <Card>
      <p className="text-xs font-bold tracking-widest text-green-deep uppercase">{vacancy.organisationName}</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">{vacancy.title}</h1>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <li className="flex items-center gap-1">
          <MapPinIcon className="size-4" aria-hidden />
          {vacancy.location}
        </li>
        <li className="flex items-center gap-1">
          <BriefcaseIcon className="size-4" aria-hidden />
          {vacancy.department} · {vacancy.employmentType}
        </li>
        <li className="flex items-center gap-1">
          <CalendarIcon className="size-4" aria-hidden />
          Closes {formatDate(vacancy.closingDate)}
        </li>
      </ul>

      {step === "done" && result ? (
        <div className="mt-6 space-y-3 rounded-xl bg-success-soft p-5 text-success-soft-foreground" role="status">
          <p className="flex items-center gap-2 text-lg font-bold">
            <CheckCircle2Icon className="size-5" aria-hidden />
            Application submitted
          </p>
          <p className="text-sm">
            Your application reference is <span className="font-mono font-bold">{result.reference}</span>. Keep it for your
            records.
          </p>
          <p className="text-sm">
            We have sent a confirmation to {result.email}. We will email you there about the next steps.
          </p>
        </div>
      ) : vacancy.closedReason ? (
        <p className="mt-6 rounded-xl bg-warning-soft p-4 text-sm text-warning-soft-foreground">{vacancy.closedReason}</p>
      ) : step === "details" ? (
        <>
          <p className="mt-5 text-sm leading-relaxed whitespace-pre-line text-navy">{vacancy.summary}</p>
          <Button type="button" className="mt-6 w-full sm:w-auto" onClick={() => setStep("form")}>
            Apply Now
          </Button>
        </>
      ) : (
        <form
          className="mt-6 space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Full name" error={errors.fullName}>
            <Input autoComplete="name" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
          </Field>
          <Field label="Email" error={errors.email} hint="We will use this email to contact you.">
            <Input type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Confirm email" error={errors.confirmEmail}>
            <Input type="email" autoComplete="email" value={form.confirmEmail} onChange={(e) => set("confirmEmail", e.target.value)} />
          </Field>
          <Field label="Phone (optional)" error={errors.phone}>
            <Input type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>

          <div>
            <p className="text-xs font-bold text-navy">CV</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              aria-label="CV file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void chooseFile(file);
                e.target.value = "";
              }}
            />
            {cv ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-border-slate px-3 py-2 text-sm">
                <FileTextIcon className="size-4 text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-navy">{cv.fileName}</span>
                <span className="text-xs text-slate-400">{Math.max(1, Math.round(cv.sizeBytes / 1024))} KB</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCv(null);
                    setCvFile(null);
                    setCvText(null);
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <Button type="button" variant="secondary" className="mt-1" onClick={() => fileRef.current?.click()}>
                <UploadIcon aria-hidden />
                Choose CV
              </Button>
            )}
            <p className="mt-1 text-xs text-slate-400">PDF or DOCX, up to {CV_MAX_BYTES / (1024 * 1024)} MB.</p>
            {reading ? <p className="mt-1 text-xs text-slate-500">Reading your CV…</p> : null}
            {cv && !reading && cvText === null ? (
              <p className="mt-1 text-xs text-slate-500">
                We could not read text from this file (for example a scanned image). You can still apply; the recruitment
                team will review your CV.
              </p>
            ) : null}
            {errors.cv ? (
              <p role="alert" className="mt-1 text-xs font-semibold text-error-soft-foreground">
                {errors.cv}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold text-navy">Privacy and consent</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{vacancy.consentText}</p>
            <label className="mt-2 flex items-start gap-2 text-sm text-navy">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} aria-label="I agree to the privacy and consent statement" />
              I agree to the privacy and consent statement above.
            </label>
            {errors.consent ? (
              <p role="alert" className="mt-1 text-xs font-semibold text-error-soft-foreground">
                {errors.consent}
              </p>
            ) : null}
          </div>

          {submitError ? (
            <p role="alert" className="rounded-lg bg-error-soft px-3 py-2 text-sm text-error-soft-foreground">
              {submitError}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep("details")}>
              Back to role details
            </Button>
            <Button type="submit" disabled={reading}>
              Submit Application
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <main className="w-full max-w-xl rounded-2xl border border-border-slate bg-white p-6 shadow-sm sm:p-8">{children}</main>;
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-bold text-navy">
      {label}
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block font-normal text-slate-400">{hint}</span> : null}
      {error ? (
        <span role="alert" className="mt-1 block font-semibold text-error-soft-foreground">
          {error}
        </span>
      ) : null}
    </label>
  );
}
