import { useState } from 'react';
import { TWO_BY } from '../core/catalog';
import { ALONG, RAMP_KINDS, RAMP_MATERIALS, RAMP_STARTS, SPACINGS, newRamp, type Ramp, type ShedConfig } from '../core/config';
import { leanToFloorOn } from '../core/gen/deck';
import { rampLeanToFloor, rampPlace } from '../core/gen/ramps';
import { naming } from '../core/naming';
import { openingLabel } from '../core/placement';
import { formatInches, formatLength } from '../core/units';
import { Card, Group, LengthField, NumberField, SelectField, capitalize, setter, useListKeys, type SectionProps } from './fields';
import { EDITOR_HELP } from './help/editors';

const ALONG_LABELS: Record<Ramp['along'], string> = { percent: 'Center, % along the wall', left: 'From the left corner', right: 'From the right corner' };
const MATERIAL_LABELS: Record<Ramp['material'], string> = { wood: 'Wood: 2x6 boards on stringers', concrete: 'Concrete' };
const KIND_LABELS: Record<Ramp['kind'], string> = { ramp: 'Ramp', stairs: 'Stairs' };
const FREE = 'free';
const GONE = 'gone';
const keyOf = ({ row, index }: { row: number; index: number }) => `${row}:${index}`;

/** Each position of each opening row, by key, for a ramp to follow. */
function openingChoices(config: ShedConfig): Map<string, string> {
  const names = naming(config);
  return new Map(
    config.openings.flatMap((row, rowIndex) =>
      row.at.map((position, index) => [keyOf({ row: rowIndex, index }), openingLabel(names, row, position) + (row.enabled ? '' : ', not framed')] as const),
    ),
  );
}

/** Ramps and stairs down from the shed floor or a lean-to floor, each placed on its own or following an opening. */
export function RampsEditor({ value, onChange }: SectionProps<ShedConfig>) {
  const setAll = (ramps: Ramp[]) => onChange({ ...value, ramps });
  const [added, setAdded] = useState<number | null>(null);
  const keys = useListKeys(value.ramps.length);
  // A new ramp or stairs follows the first opening at the floor, if there is one.
  const firstDoor = value.openings.findIndex((row) => row.sill === 0 && row.at.length > 0);
  const add = (kind: Ramp['kind']) => {
    setAll([...value.ramps, { ...newRamp(), kind, opening: firstDoor < 0 ? null : { row: firstDoor, index: 0 } }]);
    setAdded(value.ramps.length);
  };

  return (
    <>
      <p className="muted hint">
        From the shed floor, or from a lean-to's deck or slab, down to the lean-to floor in the way, or to grade or below it. One that
        follows an opening moves and resizes with it.
      </p>
      {value.ramps.map((ramp, index) => (
        <RampCard
          key={keys.keys[index]}
          index={index}
          open={index === added}
          value={ramp}
          config={value}
          onChange={(next) => setAll(value.ramps.map((other, at) => (at === index ? next : other)))}
          onRemove={() => setAll(value.ramps.filter((_, at) => at !== index)) === null && keys.removed(index)}
        />
      ))}
      <div className="add-row">
        <button onClick={() => add('ramp')}>+ Ramp</button>
        <button onClick={() => add('stairs')}>+ Stairs</button>
      </div>
    </>
  );
}

interface CardProps extends SectionProps<Ramp> {
  index: number;
  open: boolean;
  config: ShedConfig;
  onRemove: () => void;
}

function RampCard({ value, index, open, config, onChange, onRemove }: CardProps) {
  const set = setter(value, onChange);
  const names = naming(config);
  const place = rampPlace(config, value);
  const choices = openingChoices(config);
  const follows = value.opening ? (place.lost ? GONE : keyOf(value.opening)) : FREE;
  const options = [FREE, ...(place.lost ? [GONE] : []), ...choices.keys()];
  const stairs = value.kind === 'stairs';
  const title = `${KIND_LABELS[value.kind]} ${index + 1}`;
  // A lean-to deck or slab that this one meets: it starts at the shed floor and lands on it, or starts at its edge.
  // The lean-to deck or slab on its wall; `meets` when it covers part of this one's span.
  const floor = leanToFloorOn(config, place.wall);
  const meets = rampLeanToFloor(config, value) !== null;
  const floorName = floor && `${names.side(place.wall)} lean-to ${floor.addition.floor}`;
  const toGround = !meets || value.from === 'lean-to';
  const startLabels: Record<Ramp['from'], string> = {
    floor: `Shed floor, down to the ${floorName}`,
    'lean-to': `The ${floorName}'s edge, down to grade`,
  };
  const where = `${place.opening ?? `${capitalize(names.side(place.wall))} wall`}, ${formatLength(place.right - place.left)} wide`;

  // Leaving an opening keeps the ramp where it stands.
  function follow(key: string) {
    if (key === FREE) return onChange({ ...value, opening: null, wall: place.wall, along: 'left', at: place.left, width: place.right - place.left });
    const [row, at] = key.split(':').map(Number);
    return onChange({ ...value, opening: { row, index: at } });
  }

  return (
    <Card
      title={title}
      brief={stairs ? where : `${where}, 1 in ${value.slope}${value.material === 'concrete' ? ', concrete' : ''}`}
      open={open}
      actions={
        <button className="remove" aria-label={`Remove ${title}`} onClick={onRemove}>
          ×
        </button>
      }
    >
      <SelectField label="Kind" value={value.kind} options={RAMP_KINDS} describe={(kind) => KIND_LABELS[kind]} onChange={set('kind')} help={EDITOR_HELP['ramps.kind']} />
      <Group title="Place" brief={where}>
        <SelectField
          label="Follows"
          value={follows}
          options={options}
          describe={(key) => (key === FREE ? 'No opening: placed below' : key === GONE ? 'An opening that is gone' : choices.get(key)!)}
          onChange={follow}
          help={EDITOR_HELP['ramps.opening']}
        />
        {value.opening ? (
          <LengthField label="Wider than the RO, each side" value={value.margin} onChange={set('margin')} help={EDITOR_HELP['ramps.margin']} />
        ) : (
          <>
            <SelectField label="Wall" value={value.wall} options={names.sides} describe={(wall) => capitalize(names.side(wall))} onChange={set('wall')} help={EDITOR_HELP['ramps.wall']} />
            <SelectField label="Position from" value={value.along} options={ALONG} describe={(along) => ALONG_LABELS[along]} onChange={set('along')} help={EDITOR_HELP['ramps.along']} />
            {value.along === 'percent' ? (
              <NumberField label="Center (% of the wall)" value={value.at} onChange={set('at')} help={EDITOR_HELP['ramps.at:percent']} />
            ) : (
              <LengthField label="Corner to the near edge" value={value.at} onChange={set('at')} help={EDITOR_HELP['ramps.at:corner']} />
            )}
            <LengthField label="Width" value={value.width} onChange={set('width')} help={EDITOR_HELP['ramps.width']} />
          </>
        )}
        {floor && (
          <SelectField label="Starts at" value={value.from} options={RAMP_STARTS} describe={(from) => startLabels[from]} onChange={set('from')} help={EDITOR_HELP['ramps.from']} />
        )}
      </Group>
      {stairs ? (
        <Group title="Steps" brief={toGround && value.belowGrade > 0 ? `Foot ${formatInches(value.belowGrade)} below grade` : 'Standard'}>
          <p className="muted hint">
            Equal risers of 7-1/2" or less, and 11-1/4" treads of two 5/4x6, on PT 2x12 cut stringers no more than 18" apart. Open risers.
          </p>
          {toGround && <LengthField label="Foot below grade" value={value.belowGrade} onChange={set('belowGrade')} help={EDITOR_HELP['ramps.belowGrade']} />}
        </Group>
      ) : (
        <Group title="Slope" brief={`1 in ${value.slope}${toGround && value.belowGrade > 0 ? `, foot ${formatInches(value.belowGrade)} below grade` : ''}`}>
          <NumberField label="Slope: run per 1 of rise" value={value.slope} onChange={set('slope')} help={EDITOR_HELP['ramps.slope']} />
          {toGround && <LengthField label="Foot below grade" value={value.belowGrade} onChange={set('belowGrade')} help={EDITOR_HELP['ramps.belowGrade']} />}
        </Group>
      )}
      {!stairs && (
        <Group
          title="Build"
          brief={value.material === 'concrete' ? `Concrete, ${formatInches(value.thickness)} base` : `${value.stringer} stringers at ${value.oc}"`}
        >
          <SelectField label="Material" value={value.material} options={RAMP_MATERIALS} describe={(material) => MATERIAL_LABELS[material]} onChange={set('material')} help={EDITOR_HELP['ramps.material']} />
          {value.material === 'concrete' ? (
            <LengthField label="Thickness under the foot" value={value.thickness} onChange={set('thickness')} help={EDITOR_HELP['ramps.thickness']} />
          ) : (
            <>
              <SelectField label="Stringers" value={value.stringer} options={TWO_BY} onChange={set('stringer')} help={EDITOR_HELP['ramps.stringer']} />
              <SelectField label="Stringer spacing" value={value.oc} options={SPACINGS} describe={(oc) => `${oc}" o.c.`} onChange={set('oc')} help={EDITOR_HELP['ramps.oc']} />
            </>
          )}
        </Group>
      )}
    </Card>
  );
}
