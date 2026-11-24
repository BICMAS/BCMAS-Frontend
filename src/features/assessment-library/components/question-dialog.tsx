"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  RESPONSE_TYPES,
  RESPONSE_TYPE_LABEL,
  type Difficulty,
  type ItemOption,
  type ResponseType,
  type RubricLevel,
  type TemplateItem,
} from "../types";
import { fieldSelectClass } from "./library-shared";

const DEFAULT_RUBRIC: RubricLevel[] = [
  { score: 1, descriptor: "" },
  { score: 2, descriptor: "" },
  { score: 3, descriptor: "" },
  { score: 4, descriptor: "" },
];

/** Add Question / edit question, including its answer key or rubric (admin-only). */
export function QuestionDialog({
  open,
  onOpenChange,
  item,
  competencies,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing item to edit, or a blank item with its new id. */
  item: TemplateItem | null;
  competencies: string[];
  onSave: (item: TemplateItem) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {open && item ? (
          <QuestionForm
            key={item.id}
            item={item}
            competencies={competencies}
            onCancel={() => onOpenChange(false)}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function blankItem(id: string, competency: string): TemplateItem {
  return {
    id,
    title: "",
    text: "",
    responseType: "sjt",
    options: [
      { id: "o1", text: "" },
      { id: "o2", text: "" },
      { id: "o3", text: "" },
    ],
    competency,
    difficulty: "intermediate",
    scoring: { points: 1 },
  };
}

function QuestionForm({
  item,
  competencies,
  onCancel,
  onSave,
}: {
  item: TemplateItem;
  competencies: string[];
  onCancel: () => void;
  onSave: (item: TemplateItem) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [text, setText] = useState(item.text);
  const [responseType, setResponseType] = useState<ResponseType>(item.responseType);
  const [competency, setCompetency] = useState(item.competency || competencies[0] || "");
  const [difficulty, setDifficulty] = useState<Difficulty>(item.difficulty);
  const [options, setOptions] = useState<ItemOption[]>(
    item.options.length ? item.options : [{ id: "o1", text: "" }, { id: "o2", text: "" }],
  );
  const [correct, setCorrect] = useState(item.scoring.correctOptionId ?? "");
  const [rubric, setRubric] = useState<RubricLevel[]>(item.scoring.rubric ?? DEFAULT_RUBRIC);
  const [error, setError] = useState<string | null>(null);
  const written = responseType === "case_response";

  function save() {
    if (!title.trim()) return setError("Give the question a short title.");
    if (!text.trim()) return setError("Enter the question text.");
    if (!competency) return setError("Map the question to a competency.");
    if (written) {
      const levels = rubric.filter((level) => level.descriptor.trim());
      if (levels.length < 2) return setError("Describe at least two rubric levels.");
      onSave({
        ...item,
        title: title.trim(),
        text: text.trim(),
        responseType,
        options: [],
        competency,
        difficulty,
        scoring: { points: Math.max(...levels.map((l) => l.score)), rubric: levels },
      });
      return;
    }
    const filled = options.filter((option) => option.text.trim());
    if (filled.length < 2) return setError("Add at least two answer options.");
    if (!filled.some((option) => option.id === correct)) return setError("Choose the keyed (correct) answer.");
    onSave({
      ...item,
      title: title.trim(),
      text: text.trim(),
      responseType,
      options: filled.map((option) => ({ ...option, text: option.text.trim() })),
      competency,
      difficulty,
      scoring: { points: 1, correctOptionId: correct },
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{item.title ? `Edit ${item.id.toUpperCase()}` : `Add question ${item.id.toUpperCase()}`}</DialogTitle>
        <DialogDescription>
          The answer key and rubric are visible to BICMAS administrators only. Candidates never see them.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-bold text-navy sm:col-span-3">
          Short title
          <Input className="mt-1" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="text-xs font-bold text-navy sm:col-span-3">
          Question text
          <Textarea className="mt-1" rows={3} value={text} maxLength={1500} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="text-xs font-bold text-navy">
          Response type
          <select
            className={fieldSelectClass}
            value={responseType}
            onChange={(e) => setResponseType(e.target.value as ResponseType)}
          >
            {RESPONSE_TYPES.map((type) => (
              <option key={type} value={type}>
                {RESPONSE_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-navy">
          Competency
          <select className={fieldSelectClass} value={competency} onChange={(e) => setCompetency(e.target.value)}>
            {competencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-navy">
          Difficulty
          <select
            className={fieldSelectClass}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {written ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-navy">Scoring rubric</legend>
          {rubric.map((level, index) => (
            <label key={level.score} className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-14 shrink-0 font-bold text-navy">Score {level.score}</span>
              <Input
                aria-label={`Rubric level ${level.score}`}
                value={level.descriptor}
                onChange={(e) =>
                  setRubric((current) =>
                    current.map((l, i) => (i === index ? { ...l, descriptor: e.target.value } : l)),
                  )
                }
              />
            </label>
          ))}
        </fieldset>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-navy">Answer options (select the keyed answer)</legend>
          {options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="keyed-answer"
                aria-label={`Option ${index + 1} is the keyed answer`}
                checked={correct === option.id}
                onChange={() => setCorrect(option.id)}
              />
              <Input
                aria-label={`Option ${index + 1}`}
                value={option.text}
                onChange={(e) =>
                  setOptions((current) => current.map((o) => (o.id === option.id ? { ...o, text: e.target.value } : o)))
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove option ${index + 1}`}
                disabled={options.length <= 2}
                onClick={() => setOptions((current) => current.filter((o) => o.id !== option.id))}
              >
                <Trash2Icon aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={options.length >= 6}
            onClick={() =>
              setOptions((current) => {
                const max = current.reduce((m, o) => Math.max(m, Number(o.id.slice(1)) || 0), 0);
                return [...current, { id: `o${max + 1}`, text: "" }];
              })
            }
          >
            <PlusIcon aria-hidden />
            Add option
          </Button>
        </fieldset>
      )}

      {error ? (
        <p role="alert" className="text-sm text-error-soft-foreground">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={save}>
          Save question
        </Button>
      </DialogFooter>
    </>
  );
}
