import { LUMBER_SIZES } from '../core/catalog';
import {
  ALONG,
  HEADER_STYLES,
  OPENING_KINDS,
  type Opening,
  type OpeningType,
  type ShedConfig,
} from '../core/config';
import { wallTops } from '../core/gen/walls';
import { naming } from '../core/naming';
import { evenPercents, positionFor, roOffset, wallSpan } from '../core/placement';
import { formatInches, parseLength } from '../core/units';
import {
  CheckField,
  LengthField,
  NOT_A_LENGTH,
  ParsedInput,
  SelectField,
  SelectInput,
  TextField,
  capitalize,
  setter,
  type Edit,
  type SectionProps,
} from './fields';

type Kind = OpeningType['kind'];
interface Size {
  label: string; // in the size select
  name: string; // automatic type name
  width: number;
  height: number;
}

const KIND_LABELS: Record<Kind, string> = { door: 'Door', window: 'Window', overhead: 'Garage door', custom: 'Custom' };
const KIND_NAMES: Record<Kind, string> = { door: 'door', window: 'window', overhead: 'door garage', custom: 'opening' };
const GIRDER_LABELS: Record<OpeningType['girder'], string> = {
  single: 'Single girder',
  double: 'Double girder',
  triple: 'Triple girder',
  flat: 'Flat',
};
const ALONG_LABELS: Record<Opening['along'], string> = { percent: '% along wall', left: 'From left', right: 'From right' };
const HEADER_SIZES = ['default', ...LUMBER_SIZES] as const;
const JACKS = ['auto', 1, 2, 3] as const;

// Rough openings (RO) from product listings. Check each against the maker's data before framing.
// - Prehung door: door width + 2 in by door height + 2-1/4 in (36 x 80: RO 38 x 82-1/4).
// - Window: RO equals the nominal size; the unit is 1/2 in smaller (3040: RO 36 x 48).
// - Garage (overhead) door: RO equals the door size.
const prehung = (width: number, height: number, double = false): Size => ({
  label: `${width}" × ${height}" ${double ? 'double ' : ''}prehung`,
  name: `${double ? 'double door' : 'door'} ${width}${height === 80 ? '' : `x${height}`}`,
  width: width + 2,
  height: height + 2.25,
});
const nominalCode = (inches: number) => `${Math.floor(inches / 12)}${inches % 12}`;
const windowSize = (width: number, height: number): Size => ({
  label: `${nominalCode(width)}${nominalCode(height)} (${width}" × ${height}")`,
  name: `window ${width}x${height}`,
  width,
  height,
});
const garageSize = (feetWide: number, feetHigh: number): Size => ({
  label: `${feetWide}' × ${feetHigh}'`,
  name: `door garage ${feetWide}x${feetHigh}`,
  width: feetWide * 12,
  height: feetHigh * 12,
});

const SIZES: Partial<Record<Kind, Size[]>> = {
  door: [
    ...[24, 28, 30, 32, 34, 36].map((width) => prehung(width, 80)),
    ...[30, 32, 36].map((width) => prehung(width, 96)),
    ...[48, 60, 72].map((width) => prehung(width, 80, true)),
  ],
  window: [24, 30, 36, 48, 60, 72].flatMap((width) => [24, 36, 48, 60].map((height) => windowSize(width, height))),
  overhead: [
    [8, 7], [9, 7], [9, 8], [10, 7], [10, 8], [12, 7], [12, 8], [16, 7], [16, 8],
  ].map(([feetWide, feetHigh]) => garageSize(feetWide, feetHigh)),
};

const DEFAULT_SIZE: Record<Kind, Size> = {
  door: prehung(36, 80),
  window: windowSize(24, 36),
  overhead: garageSize(9, 7),
  custom: { label: '', name: 'opening 48x48', width: 48, height: 48 },
};

const DOOR_HEAD = prehung(36, 80).height;

function autoName(kind: Kind, width: number, height: number): string {
  const size = SIZES[kind]?.find((preset) => preset.width === width && preset.height === height);
  return size?.name ?? `${KIND_NAMES[kind]} ${width}x${height}`;
}

function uniqueName(name: string, types: readonly OpeningType[]): string {
  const taken = new Set(types.map((type) => type.name));
  let candidate = name;
  for (let index = 2; taken.has(candidate); index++) candidate = `${name} ${index}`;
  return candidate;
}

/** Opening types: kind, RO, and header details. Renaming a type renames it in the placement rows. */
export function OpeningTypesEditor({ value, onChange }: SectionProps<ShedConfig>) {
  const types = value.openingTypes;

  const update =
    (index: number): Edit<OpeningType> =>
    (next) => {
      const previous = types[index].name;
      return onChange({
        ...value,
        openingTypes: types.map((type, at) => (at === index ? next : type)),
        openings: value.openings.map((row) => (row.type === previous ? { ...row, type: next.name } : row)),
      });
    };

  function add(kind: Kind) {
    const { name, width, height } = DEFAULT_SIZE[kind];
    const type: OpeningType = {
      name: uniqueName(name, types),
      kind,
      width,
      height,
      girder: 'double',
      plateBelow: false,
      plateAbove: false,
      jacks: 'auto',
      headroom: 12,
    };
    onChange({ ...value, openingTypes: [...types, type] });
  }

  return (
    <>
      {types.map((type, index) => (
        <TypeCard
          key={index}
          value={type}
          uses={value.openings.filter((row) => row.type === type.name).length}
          onChange={update(index)}
          onRemove={() => onChange({ ...value, openingTypes: types.filter((_, at) => at !== index) })}
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

interface TypeCardProps extends SectionProps<OpeningType> {
  uses: number;
  onRemove: () => void;
}

function TypeCard({ value, uses, onChange, onRemove }: TypeCardProps) {
  const set = setter(value, onChange);
  const sizes = SIZES[value.kind];
  const size = sizes?.find((preset) => preset.width === value.width && preset.height === value.height);
  const hasAutoName = value.name === autoName(value.kind, value.width, value.height);

  // While the type keeps its automatic name, the name follows the size.
  const resize = (kind: Kind, width: number, height: number) =>
    onChange({ ...value, kind, width, height, name: hasAutoName ? autoName(kind, width, height) : value.name });

  return (
    <fieldset className="card">
      <legend>{value.name}</legend>
      <button
        className="remove"
        aria-label={`Remove ${value.name}`}
        title={uses ? `In use by ${uses} opening row${uses > 1 ? 's' : ''}` : undefined}
        disabled={uses > 0}
        onClick={onRemove}
      >
        ×
      </button>
      <TextField label="Name" value={value.name} onChange={set('name')} />
      <SelectField
        label="Kind"
        value={value.kind}
        options={OPENING_KINDS}
        describe={(kind) => KIND_LABELS[kind]}
        onChange={(kind) => resize(kind, DEFAULT_SIZE[kind].width, DEFAULT_SIZE[kind].height)}
      />
      {sizes && (
        <SelectField
          label="Size"
          value={size?.label ?? 'custom'}
          options={['custom', ...sizes.map((preset) => preset.label)]}
          describe={(label) => (label === 'custom' ? 'Custom RO' : label)}
          onChange={(label) => {
            const preset = sizes.find((candidate) => candidate.label === label);
            return preset ? resize(value.kind, preset.width, preset.height) : null;
          }}
        />
      )}
      <LengthField label="RO width" value={value.width} onChange={(width) => resize(value.kind, width, value.height)} />
      <LengthField label="RO height" value={value.height} onChange={(height) => resize(value.kind, value.width, height)} />
      <SelectField
        label="Girder"
        value={value.girder}
        options={HEADER_STYLES}
        describe={(style) => GIRDER_LABELS[style]}
        onChange={set('girder')}
      />
      {value.girder !== 'flat' && (
        <SelectField
          label="Girder size"
          value={value.header ?? 'default'}
          options={HEADER_SIZES}
          describe={(choice) => (choice === 'default' ? 'Wall default' : choice)}
          onChange={(choice) => set('header')(choice === 'default' ? undefined : choice)}
        />
      )}
      <CheckField label="Flat plate below header" value={value.plateBelow} onChange={set('plateBelow')} />
      <CheckField label="Flat plate above header" value={value.plateAbove} onChange={set('plateAbove')} />
      <SelectField label="Jacks per side" value={value.jacks} options={JACKS} onChange={set('jacks')} />
      {value.kind === 'overhead' && (
        <LengthField label="Headroom needed" value={value.headroom} onChange={set('headroom')} />
      )}
    </fieldset>
  );
}

// Doors sit on the floor. Windows get their head level with a prehung door head.
const defaultSill = (type: OpeningType) =>
  type.kind === 'window' || type.kind === 'custom' ? Math.max(0, DOOR_HEAD - type.height) : 0;

/** Placement rows: an opening type on a wall, at one or more positions. */
export function OpeningRowsEditor({ value, onChange }: SectionProps<ShedConfig>) {
  const names = value.openingTypes.map((type) => type.name);
  const setRows = (openings: Opening[]) => onChange({ ...value, openings });
  const update =
    (index: number): Edit<Opening> =>
    (next) =>
      setRows(value.openings.map((row, at) => (at === index ? next : row)));

  if (names.length === 0) return <p className="muted hint">Add an opening type first.</p>;

  function add() {
    const [type] = value.openingTypes;
    setRows([
      ...value.openings,
      { enabled: true, type: type.name, wall: 'front', sill: defaultSill(type), along: 'percent', at: [50] },
    ]);
  }

  return (
    <>
      <p className="muted hint">Several positions per row: type 25% 75%, or 24", 96", or use the count.</p>
      <p className="muted hint">
        On a gable end, a sill at or above the wall top ({formatInches(wallTops(value).left)}) frames the opening in the gable.
      </p>
      {value.openings.map((row, index) => (
        <OpeningRow
          key={index}
          value={row}
          config={value}
          names={names}
          onChange={update(index)}
          onRemove={() => setRows(value.openings.filter((_, at) => at !== index))}
        />
      ))}
      <div className="add-row">
        <button onClick={add}>+ Place an opening</button>
      </div>
    </>
  );
}

interface RowProps extends SectionProps<Opening> {
  config: ShedConfig;
  names: string[];
  onRemove: () => void;
}

function OpeningRow({ value, config, names, onChange, onRemove }: RowProps) {
  const set = setter(value, onChange);
  const sides = naming(config);
  const type = config.openingTypes.find((candidate) => candidate.name === value.type)!;
  const span = wallSpan(config, value.wall);

  // Positions in `along` units for RO left edges at `offsets`. Percents round to 0.1, lengths to 1/16 in.
  const positions = (along: Opening['along'], offsets: number[]) =>
    offsets.map((offset) => {
      const position = positionFor(along, offset, span, type.width);
      return along === 'percent' ? Math.round(position * 10) / 10 : Math.round(position * 16) / 16;
    });

  // A new reference keeps each opening where it is.
  const changeAlong = (along: Opening['along']) =>
    onChange({
      ...value,
      along,
      at: positions(along, value.at.map((position) => roOffset(value.along, position, span, type.width))),
    });

  // A new count spreads the openings evenly. It replaces typed positions.
  const spread = (count: number) =>
    onChange({
      ...value,
      at: positions(value.along, evenPercents(count).map((percent) => roOffset('percent', percent, span, type.width))),
    });

  const percent = value.along === 'percent';
  return (
    <div className={value.enabled ? 'opening-row' : 'opening-row off'}>
      <input
        type="checkbox"
        aria-label="Frame this opening"
        title="Frame this opening"
        checked={value.enabled}
        onChange={(event) => set('enabled')(event.target.checked)}
      />
      <div className="opening-grid">
        <SelectInput label="Opening type" value={value.type} options={names} disabled={!value.enabled} onChange={set('type')} />
        <SelectInput
          label="Wall"
          value={value.wall}
          options={sides.sides}
          describe={(wall) => capitalize(sides.side(wall))}
          disabled={!value.enabled}
          onChange={set('wall')}
        />
        {value.enabled && (
          <>
            <span className="muted grid-label">Sill height</span>
            <ParsedInput
              label="Sill height, floor to RO bottom"
              className="number"
              value={value.sill}
              parse={parseLength}
              format={formatInches}
              invalid={NOT_A_LENGTH}
              onChange={set('sill')}
            />
            <SelectInput
              label="Position from"
              value={value.along}
              options={ALONG}
              describe={(along) => ALONG_LABELS[along]}
              onChange={changeAlong}
            />
            <ParsedInput
              key={value.along}
              label={percent ? 'RO centers, % of the wall' : 'RO edges from the corner'}
              className="number"
              value={value.at}
              parse={percent ? parsePercents : parseLengths}
              format={percent ? formatPercents : formatLengths}
              invalid={percent ? 'Not a list of percents, e.g. 25% 75%' : `Not a list of lengths, e.g. 24", 8'`}
              onChange={set('at')}
            />
            <span className="muted grid-label">Count, spread evenly</span>
            <div className="stepper">
              <button aria-label="One fewer" disabled={value.at.length <= 1} onClick={() => spread(value.at.length - 1)}>
                −
              </button>
              <span>{value.at.length}</span>
              <button aria-label="One more" onClick={() => spread(value.at.length + 1)}>
                +
              </button>
            </div>
          </>
        )}
      </div>
      <button className="remove" aria-label="Remove opening row" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

function parsePercents(text: string): number[] | null {
  const values = text.split(/[\s,;]+/).filter(Boolean).map((token) => Number(token.replace(/%$/, '')));
  return values.length && values.every((value) => !Number.isNaN(value)) ? values : null;
}

const formatPercents = (values: number[]) => values.map((value) => `${value}%`).join(' ');

// Lengths can hold spaces (10' 6"), so only commas and semicolons separate them.
function parseLengths(text: string): number[] | null {
  const values = text.split(/[,;]/).map(parseLength);
  return values.length && values.every((value) => value !== null) ? (values as number[]) : null;
}

const formatLengths = (values: number[]) => values.map(formatInches).join(', ');
