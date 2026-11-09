import { useState, type ReactNode } from 'react';
import { formatLength, parseLength } from '../core/units';

/** Apply an edit. Returns an error message when the edit is rejected, else null. */
export type Edit<T> = (value: T) => string | null;

export interface SectionProps<T> {
  value: T;
  onChange: Edit<T>;
}

/** Return a factory of edits for the properties of `value`. */
export function setter<T extends object>(value: T, onChange: Edit<T>) {
  return <K extends keyof T>(key: K): Edit<T[K]> =>
    (next) => onChange({ ...value, [key]: next });
}

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function Section({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

export function Subhead({ children }: { children: ReactNode }) {
  return <h3 className="subhead">{children}</h3>;
}

interface FieldProps<T> {
  label: string;
  value: T;
  onChange: Edit<T>;
}

interface ParsedInputProps<T> extends FieldProps<T> {
  parse: (text: string) => T | null;
  format: (value: T) => string;
  invalid?: string;
  className?: string;
}

export const NOT_A_LENGTH = `Not a length, e.g. 7' 8-5/8"`;

/**
 * Text input without a visible label. It commits on blur or Enter. A rejected value stays in the
 * box, with its error after the input.
 */
export function ParsedInput<T>({ label, value, onChange, parse, format, invalid = 'Not valid', className }: ParsedInputProps<T>) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const parsed = parse(draft);
    const problem = parsed === null ? invalid : onChange(parsed);
    setError(problem);
    if (problem === null) setDraft(null);
  }

  return (
    <>
      <input
        aria-label={label}
        title={label}
        className={className}
        value={draft ?? format(value)}
        aria-invalid={error !== null}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
      {error && <small className="error">{error}</small>}
    </>
  );
}

function ParsedField<T>({ wide, ...props }: ParsedInputProps<T> & { wide?: boolean }) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>{props.label}</span>
      <ParsedInput {...props} />
    </label>
  );
}

export function TextField(props: FieldProps<string>) {
  return <ParsedField {...props} parse={(text) => text} format={(text) => text} />;
}

export function NumberField(props: FieldProps<number>) {
  return <ParsedField {...props} parse={parseNumber} format={String} invalid="Not a number" />;
}

export function LengthField(props: FieldProps<number>) {
  return <ParsedField {...props} parse={parseLength} format={formatLength} invalid={NOT_A_LENGTH} />;
}

/** Length field that also accepts "auto". */
export function AutoLengthField(props: FieldProps<number | 'auto'>) {
  return (
    <ParsedField
      {...props}
      parse={(text) => (text.trim().toLowerCase() === 'auto' ? 'auto' : parseLength(text))}
      format={(value) => (value === 'auto' ? 'auto' : formatLength(value))}
      invalid={`${NOT_A_LENGTH}, or auto`}
    />
  );
}

/** Comma-separated lengths. Empty text gives an empty list. */
export function LengthListField(props: FieldProps<readonly number[]>) {
  return (
    <ParsedField
      {...props}
      parse={parseLengthList}
      format={(list) => list.map(formatLength).join(', ')}
      invalid="Not a comma-separated list of lengths"
      wide
    />
  );
}

function parseNumber(text: string): number | null {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? null : value;
}

function parseLengthList(text: string): number[] | null {
  if (text.trim() === '') return [];
  const lengths = text.split(',').map(parseLength);
  return lengths.some((length) => length === null) ? null : (lengths as number[]);
}

interface SelectProps<T> extends FieldProps<T> {
  options: readonly T[];
  describe?: (option: T) => string;
  disabled?: boolean;
}

/** Select without a visible label. */
export function SelectInput<T extends string | number>({
  label,
  value,
  options,
  describe = String,
  disabled,
  onChange,
}: SelectProps<T>) {
  return (
    <select
      aria-label={label}
      title={label}
      value={String(value)}
      disabled={disabled}
      onChange={(event) => onChange(options.find((option) => String(option) === event.target.value)!)}
    >
      {options.map((option) => (
        <option key={String(option)} value={String(option)}>
          {describe(option)}
        </option>
      ))}
    </select>
  );
}

export function SelectField<T extends string | number>(props: SelectProps<T>) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <SelectInput {...props} />
    </label>
  );
}

export function CheckField({ label, value, onChange }: FieldProps<boolean>) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
