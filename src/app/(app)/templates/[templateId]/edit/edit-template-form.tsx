'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  MdAdd,
  MdClose,
  MdDragIndicator,
  MdError,
  MdExpandMore,
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
  MdSave,
} from 'react-icons/md';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { SegmentedButtons } from '@/components/ui/segmented-buttons';
import { Switch } from '@/components/ui/switch';
import { updateTemplateWithRequirementsAction } from '../../actions';

type ActionType = 'upload' | 'answer' | 'acknowledge';
type AnswerFieldType = 'short_text' | 'long_text' | 'date' | 'choice' | 'yes_no';
type Sensitivity = 'general' | 'routine_business' | 'tax_identity' | 'banking' | 'high_value_agreement';

interface RequirementDraft {
  key: string;
  title: string;
  instructions: string;
  actionType: ActionType;
  answerFieldType: AnswerFieldType;
  required: boolean;
  acceptanceCriteria: string;
  sensitivity: Sensitivity;
}

export interface InitialRequirement {
  title: string;
  instructions: string;
  actionType: ActionType;
  answerFieldType: AnswerFieldType;
  required: boolean;
  acceptanceCriteria: string;
  sensitivity: Sensitivity;
}

function emptyRequirement(): RequirementDraft {
  return {
    key: crypto.randomUUID(),
    title: '',
    instructions: '',
    actionType: 'upload',
    answerFieldType: 'short_text',
    required: true,
    acceptanceCriteria: '',
    sensitivity: 'general',
  };
}

const ACTION_TYPE_OPTIONS: { value: ActionType; label: string }[] = [
  { value: 'upload', label: 'Upload' },
  { value: 'answer', label: 'Answer' },
  { value: 'acknowledge', label: 'Acknowledge' },
];

/**
 * Same builder UI as new-template-form.tsx, deliberately kept as a
 * separate component rather than sharing one generically: this one saves
 * by replacing a draft version's whole requirement set (no per-row
 * database ids to reconcile against — the /new builder never had them
 * either), where the new-template form creates a template from scratch.
 */
export function EditTemplateForm({
  templateId,
  versionId,
  name: initialName,
  requirements: initialRequirements,
}: {
  templateId: string;
  versionId: string;
  name: string;
  requirements: InitialRequirement[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [requirements, setRequirements] = useState<RequirementDraft[]>(() =>
    initialRequirements.length > 0
      ? initialRequirements.map((r) => ({ ...r, key: crypto.randomUUID() }))
      : [emptyRequirement()],
  );
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateRow(key: string, patch: Partial<RequirementDraft>) {
    setRequirements((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRequirements((rows) => rows.filter((r) => r.key !== key));
  }

  function moveRow(sourceKey: string, targetKey: string) {
    setRequirements((rows) => {
      const sourceIndex = rows.findIndex((r) => r.key === sourceKey);
      const targetIndex = rows.findIndex((r) => r.key === targetKey);
      if (sourceIndex === -1 || targetIndex === -1) return rows;
      const next = [...rows];
      const [moved] = next.splice(sourceIndex, 1);
      if (!moved) return rows;
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function moveByIndex(index: number, direction: -1 | 1) {
    setRequirements((rows) => {
      const target = index + direction;
      if (target < 0 || target >= rows.length) return rows;
      const next = [...rows];
      const [row] = next.splice(index, 1);
      if (!row) return rows;
      next.splice(target, 0, row);
      return next;
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateTemplateWithRequirementsAction({
        templateId,
        versionId,
        name,
        requirements: requirements.map((r, index) => ({
          actionType: r.actionType,
          answerFieldType: r.actionType === 'answer' ? r.answerFieldType : null,
          title: r.title,
          instructions: r.instructions.trim() || null,
          required: r.required,
          sequence: index,
          acceptanceCriteria: r.acceptanceCriteria.trim() || null,
          sensitivity: r.sensitivity,
        })),
      });
      if ('error' in result) {
        setError(result.error);
      } else {
        router.push(`/templates/${result.templateId}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <TextField
        label="Template name"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Monthly Bookkeeping Close"
        required
      />

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-sm bg-md-error-container px-4 py-2 text-body-small text-md-on-error-container"
        >
          <MdError aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
          Error: {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {requirements.map((row, index) => (
          <RequirementRow
            key={row.key}
            row={row}
            index={index}
            isFirst={index === 0}
            isLast={index === requirements.length - 1}
            isDragging={draggedKey === row.key}
            onChange={(patch) => updateRow(row.key, patch)}
            onRemove={() => removeRow(row.key)}
            onMoveUp={() => moveByIndex(index, -1)}
            onMoveDown={() => moveByIndex(index, 1)}
            onDragStart={() => setDraggedKey(row.key)}
            onDragEnd={() => setDraggedKey(null)}
            onDropOn={() => {
              if (draggedKey && draggedKey !== row.key) moveRow(draggedKey, row.key);
              setDraggedKey(null);
            }}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outlined"
        onClick={() => setRequirements((rows) => [...rows, emptyRequirement()])}
        className="self-start"
      >
        <MdAdd aria-hidden="true" className="h-4.5 w-4.5" />
        Add requirement
      </Button>

      <Button type="submit" variant="filled" disabled={isPending}>
        <MdSave aria-hidden="true" className="h-4.5 w-4.5" />
        {isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}

function RequirementRow({
  row,
  index,
  isFirst,
  isLast,
  isDragging,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
  onDropOn,
}: {
  row: RequirementDraft;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isDragging: boolean;
  onChange: (patch: Partial<RequirementDraft>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
}) {
  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOn}
      onDragEnd={onDragEnd}
      className={cn('transition-opacity duration-(--duration-effects-fast)', isDragging && 'opacity-40')}
    >
      <div className="flex items-start gap-3">
        <MdDragIndicator
          aria-hidden="true"
          className="mt-4 h-5 w-5 shrink-0 cursor-grab text-md-on-surface-variant active:cursor-grabbing"
        />

        <div className="mt-3.5 flex flex-col">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label={`Move requirement ${index + 1} up`}
            className="text-md-on-surface-variant hover:text-md-on-surface disabled:opacity-30"
          >
            <MdKeyboardArrowUp aria-hidden="true" className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label={`Move requirement ${index + 1} down`}
            className="text-md-on-surface-variant hover:text-md-on-surface disabled:opacity-30"
          >
            <MdKeyboardArrowDown aria-hidden="true" className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex-1">
          <TextField
            label={`Requirement ${index + 1} title`}
            name="title"
            id={`${row.key}-title`}
            value={row.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="e.g. Bank statement"
            required
          />
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove requirement ${index + 1}`}
          className="mt-3.5 shrink-0 rounded-full p-1.5 text-md-on-surface-variant hover:text-md-error"
        >
          <MdClose aria-hidden="true" className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="mt-3">
        <SegmentedButtons
          aria-label={`Requirement ${index + 1} action type`}
          options={ACTION_TYPE_OPTIONS}
          value={row.actionType}
          onChange={(actionType) => onChange({ actionType })}
        />
      </div>

      {row.actionType === 'answer' && (
        <div className="mt-3 max-w-xs">
          <Select
            label="Answer type"
            id={`${row.key}-answerFieldType`}
            value={row.answerFieldType}
            onChange={(e) => onChange({ answerFieldType: e.target.value as AnswerFieldType })}
          >
            <option value="short_text">Short text</option>
            <option value="long_text">Long text</option>
            <option value="date">Date</option>
            <option value="choice">Choice</option>
            <option value="yes_no">Yes/No</option>
          </Select>
        </div>
      )}

      <div className="mt-4 flex items-start justify-between gap-4">
        <details className="group min-w-0 flex-1">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-body-small text-md-primary [&::-webkit-details-marker]:hidden">
            <MdExpandMore
              aria-hidden="true"
              className="h-4.5 w-4.5 transition-transform duration-(--duration-effects-fast) group-open:rotate-180"
            />
            More options
          </summary>
          <div className="mt-3 flex max-w-sm flex-col gap-3">
            <TextField
              label="Instructions (optional)"
              id={`${row.key}-instructions`}
              value={row.instructions}
              onChange={(e) => onChange({ instructions: e.target.value })}
            />
            <TextField
              label="Acceptance criteria (optional)"
              id={`${row.key}-acceptanceCriteria`}
              value={row.acceptanceCriteria}
              onChange={(e) => onChange({ acceptanceCriteria: e.target.value })}
            />
            <Select
              label="Sensitivity"
              id={`${row.key}-sensitivity`}
              value={row.sensitivity}
              onChange={(e) => onChange({ sensitivity: e.target.value as Sensitivity })}
              supportingText="Feeds the step-up authentication ladder later (not enforced yet) — leave as General unless this item is tax/identity, banking, or a high-value agreement."
            >
              <option value="general">General</option>
              <option value="routine_business">Routine business</option>
              <option value="tax_identity">Tax / identity</option>
              <option value="banking">Banking</option>
              <option value="high_value_agreement">High-value agreement</option>
            </Select>
          </div>
        </details>

        <div className="flex shrink-0 items-center gap-2">
          <span aria-hidden="true" className="text-body-small text-md-on-surface-variant">
            Required
          </span>
          <Switch
            checked={row.required}
            onChange={(required) => onChange({ required })}
            aria-label={`Requirement ${index + 1} required`}
          />
        </div>
      </div>
    </Card>
  );
}
