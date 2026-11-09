import { TWO_BY } from '../core/catalog';
import { OPENING_KINDS, WALLS, type Opening } from '../core/config';
import { LengthField, SelectField, capitalize, setter, type Edit, type SectionProps } from './fields';

type Kind = Opening['kind'];

const KIND_LABELS: Record<Kind, string> = { door: 'Door', window: 'Window', overhead: 'Overhead door', custom: 'Custom' };
const ID_PREFIX: Record<Kind, string> = { door: 'D', window: 'W', overhead: 'G', custom: 'C' };
const HEADERS = ['default', ...TWO_BY] as const;
const JACKS = ['auto', 1, 2, 3] as const;

const NEW_OPENING: Record<Kind, Pick<Opening, 'width' | 'height' | 'sill'>> = {
  door: { width: 38, height: 82.5, sill: 0 }, // 36 in prehung door
  window: { width: 24.5, height: 36.5, sill: 46 }, // head at 82-1/2 in, level with door heads
  overhead: { width: 108, height: 84, sill: 0 }, // 9 x 7 ft door
  custom: { width: 48, height: 48, sill: 24 },
};

const hasSill = (kind: Kind) => kind === 'window' || kind === 'custom';

function nextId(openings: Opening[], kind: Kind): string {
  const prefix = ID_PREFIX[kind];
  const used = openings
    .filter((opening) => opening.id.startsWith(prefix))
    .map((opening) => Number(opening.id.slice(prefix.length)) || 0);
  return `${prefix}${Math.max(0, ...used) + 1}`;
}

export function OpeningsEditor({ value, onChange }: SectionProps<Opening[]>) {
  const update =
    (index: number): Edit<Opening> =>
    (next) =>
      onChange(value.map((opening, at) => (at === index ? next : opening)));

  function add(kind: Kind) {
    onChange([
      ...value,
      { id: nextId(value, kind), kind, wall: 'front', offset: 24, jacks: 'auto', ...NEW_OPENING[kind] },
    ]);
  }

  return (
    <>
      {value.map((opening, index) => (
        <OpeningCard
          key={opening.id}
          value={opening}
          onChange={update(index)}
          onRemove={() => onChange(value.filter((_, at) => at !== index))}
        />
      ))}
      <div className="add-row">
        {OPENING_KINDS.map((kind) => (
          <button key={kind} onClick={() => add(kind)}>
            + {KIND_LABELS[kind]}
          </button>
        ))}
      </div>
    </>
  );
}

function OpeningCard({ value, onChange, onRemove }: SectionProps<Opening> & { onRemove: () => void }) {
  const set = setter(value, onChange);
  return (
    <fieldset className="card">
      <legend>{value.id}</legend>
      <button className="remove" aria-label={`Remove ${value.id}`} onClick={onRemove}>
        ×
      </button>
      <SelectField
        label="Kind"
        value={value.kind}
        options={OPENING_KINDS}
        describe={(kind) => KIND_LABELS[kind]}
        onChange={(kind) => onChange({ ...value, kind, sill: hasSill(kind) ? value.sill : 0 })}
      />
      <SelectField label="Wall" value={value.wall} options={WALLS} describe={capitalize} onChange={set('wall')} />
      <LengthField label="From left corner" value={value.offset} onChange={set('offset')} />
      <LengthField label="RO width" value={value.width} onChange={set('width')} />
      <LengthField label="RO height" value={value.height} onChange={set('height')} />
      {hasSill(value.kind) && <LengthField label="Sill height" value={value.sill} onChange={set('sill')} />}
      <SelectField
        label="Header"
        value={value.header ?? 'default'}
        options={HEADERS}
        describe={(header) => (header === 'default' ? 'Wall default' : header)}
        onChange={(header) => set('header')(header === 'default' ? undefined : header)}
      />
      <SelectField label="Jacks per side" value={value.jacks} options={JACKS} onChange={set('jacks')} />
    </fieldset>
  );
}
