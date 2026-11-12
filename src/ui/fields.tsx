import { Fragment, useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { formatLength, formatMoney, parseLength } from '../core/units';

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

/**
 * Keys for a list edited by index, so each item keeps its own field drafts and fold state when one
 * before it goes. Call `removed(index)` after a remove that the design took.
 */
export function useListKeys(length: number) {
  const [keys, setKeys] = useState(() => Array.from({ length }, (_, index) => index));
  // Items added at the end, or a list that undo or a load changed, take new keys at the end.
  if (keys.length !== length) {
    const next = Math.max(-1, ...keys) + 1;
    setKeys(keys.length < length ? [...keys, ...Array.from({ length: length - keys.length }, (_, index) => next + index)] : keys.slice(0, length));
  }
  return { keys, removed: (index: number) => setKeys((current) => current.filter((_, at) => at !== index)) };
}

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface FoldProps {
  title: string;
  /** A short summary, shown beside the title while the fold is closed. */
  brief?: string;
  open?: boolean;
  /** A feature switch in the header. While it is off, the fold shows only its header. */
  enabled?: boolean;
  onEnable?: Edit<boolean>;
  /** Buttons at the right end of the header. */
  actions?: ReactNode;
  /** What the part does: a `?` beside the title, as on a field. */
  help?: Help;
  children: ReactNode;
}

function Fold({ kind, title, brief, open = false, enabled, onEnable, actions, help, children }: FoldProps & { kind: string }) {
  // A switch turned on opens the fold, to show the fields it adds.
  const [opened, setOpened] = useState(false);
  const { button, panel, row } = useHelp(title, help);
  const switchId = useId();
  // The switch turns the label into a `details`, so React mounts a new switch: focus follows it.
  const refocus = useRef(false);
  const toggle = onEnable && (
    <input
      id={switchId}
      ref={(element) => {
        if (element && refocus.current) {
          refocus.current = false;
          element.focus();
        }
      }}
      type="checkbox"
      aria-label={title}
      checked={enabled}
      onChange={(event) => {
        refocus.current = true;
        onEnable(event.target.checked);
        setOpened(event.target.checked);
      }}
    />
  );
  if (onEnable && !enabled) {
    return (
      <>
        <label className={`fold ${kind} off`} htmlFor={switchId} {...row}>
          <span className="title">
            {title}
            {button}
          </span>
          {toggle}
        </label>
        {panel}
      </>
    );
  }
  return (
    <>
      <details className={`fold ${kind}`} open={open || opened}>
        <summary {...row}>
          <span className="title">
            {title}
            {button}
          </span>
          {brief && <span className="brief">{brief}</span>}
          {toggle}
          {actions}
        </summary>
        {children}
      </details>
      {panel}
    </>
  );
}

/** A top-level form section that folds closed. */
export const Section = (props: FoldProps) => <Fold kind="section" {...props} />;

/** A group of related fields inside a section that folds closed. */
export const Group = (props: FoldProps) => <Fold kind="group" {...props} />;

/** One item of a list, such as an opening type, that folds closed. */
export const Card = (props: FoldProps) => <Fold kind="card" {...props} />;

/** What a setting does. `options` explains each choice of a select, keyed by its value. */
export interface Help {
  about: string;
  options?: Readonly<Record<string, string>>;
}

interface FieldProps<T> {
  label: string;
  value: T;
  onChange: Edit<T>;
  help?: Help;
}

// A mouse resting this long on a setting's row opens its help.
const HOVER_DELAY = 1000; // ms

// Popover came in Safari 17 and Firefox 125. Without it, the box is a fixed element, there only while open.
const POPOVER = typeof HTMLElement !== 'undefined' && 'togglePopover' in HTMLElement.prototype;

/**
 * The `?` beside a label, and its help in a floating box (a popover, so the scrolling side panel
 * cannot clip it), under the setting's row. A mouse resting on the row (its name, its input, or the
 * `?`) opens it until the mouse leaves, the page scrolls, or a press on a control. A click or tap
 * on the `?`, or on a field's name, pins it until the next click anywhere, or Esc. Spread `field`
 * on a field's `<label>`, and `row` on a fold header.
 */
function useHelp(label: string, help: Help | undefined, choices: readonly (readonly [string, string])[] = []) {
  const [open, setOpen] = useState<'hover' | 'pinned' | null>(null);
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pinnedAtPress = useRef(false);

  useEffect(() => {
    const [button, row, panel] = [buttonRef.current, rowRef.current, panelRef.current];
    if (!button || !row || !panel) return;
    if (!open) {
      if (POPOVER) panel.togglePopover(false);
      return;
    }
    if (POPOVER) panel.togglePopover(true);
    // Below the row, or above it when there is no room below; inside the window.
    const place = () => {
      const anchor = row.getBoundingClientRect();
      const box = panel.getBoundingClientRect();
      const below = anchor.bottom + 6;
      panel.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8))}px`;
      panel.style.top = `${below + box.height <= innerHeight - 8 ? below : Math.max(8, anchor.top - box.height - 6)}px`;
    };
    place();
    const onScroll = () => (open === 'hover' ? setOpen(null) : place());
    // Any press closes it, in the box too, except on its own `?`, whose click toggles it. A press on
    // another `?` closes it, and that click opens the other.
    const onPointerDown = (event: PointerEvent) => {
      if (!button.contains(event.target as Node)) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(null);
    addEventListener('scroll', onScroll, true);
    addEventListener('resize', place);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      removeEventListener('scroll', onScroll, true);
      removeEventListener('resize', place);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!help) return { button: null, panel: null, row: {}, field: {} };
  const button = (
    <button
      ref={buttonRef}
      type="button"
      className="help-button"
      aria-label={`About ${label}`}
      aria-expanded={open !== null}
      aria-controls={id}
      onClick={(event) => {
        event.preventDefault(); // inside a label or summary: keep the click off the field or fold
        clearTimeout(timer.current);
        setOpen((state) => (state === 'pinned' ? null : 'pinned'));
      }}
    >
      ?
    </button>
  );
  const panel = (POPOVER || open) && (
    <div ref={panelRef} id={id} className="help" popover={POPOVER ? 'manual' : undefined} role="note" data-pinned={open === 'pinned' || undefined}>
      <p>{help.about}</p>
      {choices.length > 0 && (
        <dl>
          {choices.map(([name, text]) => (
            <Fragment key={name}>
              <dt>{name}</dt>
              <dd>{text}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
  const stopHover = () => {
    clearTimeout(timer.current);
    setOpen((state) => (state === 'hover' ? null : state));
  };
  const row = {
    ref: (element: HTMLElement | null) => {
      rowRef.current = element;
    },
    // Only a mouse hovers: a tap also fires pointer events.
    onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse') return;
      timer.current = window.setTimeout(() => setOpen((state) => state ?? 'hover'), HOVER_DELAY);
    },
    onPointerLeave: stopHover,
    // A press on a control is work on the setting, not a pause to read: no help pops up over it.
    // This runs before the document listener that closes a pinned box.
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      pinnedAtPress.current = document.querySelector('.help[data-pinned]') !== null;
      const control = (event.target as Element).closest('input, select, button');
      if (control && control !== buttonRef.current) stopHover();
    },
  };
  // A click on the name pins the box, or only closes the pinned one. Without this, the label sends
  // the click to its first labelable child, the `?`, and the box closes and opens again.
  const field = {
    ...row,
    onClick: (event: ReactMouseEvent<HTMLElement>) => {
      if ((event.target as Element).closest('input, select, button')) return;
      event.preventDefault();
      if (!pinnedAtPress.current) setOpen('pinned');
    },
  };
  return { button, panel, row, field };
}

interface ParsedInputProps<T> extends FieldProps<T> {
  parse: (text: string) => T | null;
  format: (value: T) => string;
  invalid?: string;
  className?: string;
  /** The label as the browser's tooltip, for an input without a visible label. A field row has its name. */
  tooltip?: boolean;
}

export const NOT_A_LENGTH = `Not a length, e.g. 7' 8-5/8"`;

/**
 * Text input without a visible label. It commits on blur or Enter. A rejected value stays in the
 * box, with its error after the input.
 */
export function ParsedInput<T>({ label, value, onChange, parse, format, invalid = 'Not valid', className, tooltip = true }: ParsedInputProps<T>) {
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
        title={tooltip ? label : undefined}
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
  const { button, panel, field } = useHelp(props.label, props.help);
  return (
    <>
      <label className={wide ? 'field wide' : 'field'} {...field}>
        <span>
          {props.label}
          {button}
        </span>
        <ParsedInput {...props} tooltip={false} />
      </label>
      {panel}
    </>
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

/** A price in US dollars. Takes `$1,234.50` or `1234.5`. */
export function PriceField(props: FieldProps<number>) {
  return <ParsedField {...props} parse={(text) => parseNumber(text.replace(/[$,]/g, ''))} format={formatMoney} invalid="Not a price, e.g. $3.50" />;
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
  /** The label as the browser's tooltip, for an input without a visible label. A field row has its name. */
  tooltip?: boolean;
}

/** Select without a visible label. A rejected choice snaps back, with its error after the select. */
export function SelectInput<T extends string | number>({
  label,
  value,
  options,
  describe = String,
  disabled,
  onChange,
  tooltip = true,
}: SelectProps<T>) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <select
        aria-label={label}
        title={tooltip ? label : undefined}
        value={String(value)}
        disabled={disabled}
        aria-invalid={error !== null}
        onChange={(event) => setError(onChange(options.find((option) => String(option) === event.target.value)!))}
      >
        {options.map((option) => (
          <option key={String(option)} value={String(option)}>
            {describe(option)}
          </option>
        ))}
      </select>
      {error && <small className="error">{error}</small>}
    </>
  );
}

export function SelectField<T extends string | number>(props: SelectProps<T>) {
  const describe = props.describe ?? String;
  const choices = props.options.flatMap((option) => {
    const text = props.help?.options?.[String(option)];
    return text ? [[describe(option), text] as const] : [];
  });
  const { button, panel, field } = useHelp(props.label, props.help, choices);
  return (
    <>
      <label className="field" {...field}>
        <span>
          {props.label}
          {button}
        </span>
        <SelectInput {...props} tooltip={false} />
      </label>
      {panel}
    </>
  );
}

/** A color picker. It commits when the picker closes, not at each step of a drag. */
export function ColorField({ label, value, onChange, help }: FieldProps<string>) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const element = input.current!;
    const commit = () => onChange(element.value);
    element.addEventListener('change', commit);
    return () => element.removeEventListener('change', commit);
  }, [onChange]);
  const { button, panel, field } = useHelp(label, help);
  return (
    <>
      <label className="field" {...field}>
        <span>
          {label}
          {button}
        </span>
        <input ref={input} type="color" aria-label={label} key={value} defaultValue={value} />
      </label>
      {panel}
    </>
  );
}

export function CheckField({ label, value, onChange, help }: FieldProps<boolean>) {
  const [error, setError] = useState<string | null>(null);
  const { button, panel, field } = useHelp(label, help);
  return (
    <>
      <label className="field" {...field}>
        <span>
          {label}
          {button}
        </span>
        <input type="checkbox" aria-label={label} checked={value} aria-invalid={error !== null} onChange={(event) => setError(onChange(event.target.checked))} />
        {error && <small className="error">{error}</small>}
      </label>
      {panel}
    </>
  );
}

/** The visible name of a bare input in a grid, with its help. The input is a sibling, not a child. */
export function GridLabel({ label, help }: { label: string; help: Help }) {
  const { button, panel, field } = useHelp(label, help);
  return (
    <>
      <span className="muted grid-label" {...field}>
        {label}
        {button}
      </span>
      {panel}
    </>
  );
}
