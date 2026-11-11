import { useState } from 'react';
import { TWO_BY } from '../core/catalog';
import { ALONG, RAMP_MATERIALS, SPACINGS, newRamp, type Ramp, type ShedConfig } from '../core/config';
import { rampPlace } from '../core/gen/ramps';
import { naming } from '../core/naming';
import { openingLabel } from '../core/placement';
import { formatInches, formatLength } from '../core/units';
import { Card, Group, LengthField, NumberField, SelectField, capitalize, setter, type SectionProps } from './fields';

const ALONG_LABELS: Record<Ramp['along'], string> = { percent: 'Center, % along the wall', left: 'From the left corner', right: 'From the right corner' };
const MATERIAL_LABELS: Record<Ramp['material'], string> = { wood: 'Wood: 2x6 boards on stringers', concrete: 'Concrete' };
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

/** Ramps from the floor down to grade, each placed on its own or following an opening. */
export function RampsEditor({ value, onChange }: SectionProps<ShedConfig>) {
  const setAll = (ramps: Ramp[]) => onChange({ ...value, ramps });
  const [added, setAdded] = useState<number | null>(null);
  // A new ramp follows the first opening at the floor, if there is one.
  const firstDoor = value.openings.findIndex((row) => row.sill === 0 && row.at.length > 0);

  return (
    <>
      <p className="muted hint">
        Wood or concrete, from the floor down to grade, or below it. A ramp that follows an opening moves and resizes with it.
      </p>
      {value.ramps.map((ramp, index) => (
        <RampCard
          key={index}
          index={index}
          open={index === added}
          value={ramp}
          config={value}
          onChange={(next) => setAll(value.ramps.map((other, at) => (at === index ? next : other)))}
          onRemove={() => setAll(value.ramps.filter((_, at) => at !== index))}
        />
      ))}
      <div className="add-row">
        <button
          onClick={() => {
            setAll([...value.ramps, { ...newRamp(), opening: firstDoor < 0 ? null : { row: firstDoor, index: 0 } }]);
            setAdded(value.ramps.length);
          }}
        >
          + Ramp
        </button>
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
  const title = `Ramp ${index + 1}`;

  // Leaving an opening keeps the ramp where it stands.
  function follow(key: string) {
    if (key === FREE) return onChange({ ...value, opening: null, wall: place.wall, along: 'left', at: place.left, width: place.right - place.left });
    const [row, at] = key.split(':').map(Number);
    return onChange({ ...value, opening: { row, index: at } });
  }

  return (
    <Card
      title={title}
      brief={`${place.opening ?? `${capitalize(names.side(place.wall))} wall`}, ${formatLength(place.right - place.left)} wide, 1 in ${value.slope}${value.material === 'concrete' ? ', concrete' : ''}`}
      open={open}
      actions={
        <button className="remove" aria-label={`Remove ${title}`} onClick={onRemove}>
          ×
        </button>
      }
    >
      <Group title="Place" brief={`${place.opening ?? `${capitalize(names.side(place.wall))} wall`}, ${formatLength(place.right - place.left)} wide`}>
        <SelectField
          label="Follows"
          value={follows}
          options={options}
          describe={(key) => (key === FREE ? 'No opening: placed below' : key === GONE ? 'An opening that is gone' : choices.get(key)!)}
          onChange={follow}
        />
        {value.opening ? (
          <LengthField label="Wider than the RO, each side" value={value.margin} onChange={set('margin')} />
        ) : (
          <>
            <SelectField label="Wall" value={value.wall} options={names.sides} describe={(wall) => capitalize(names.side(wall))} onChange={set('wall')} />
            <SelectField label="Position from" value={value.along} options={ALONG} describe={(along) => ALONG_LABELS[along]} onChange={set('along')} />
            {value.along === 'percent' ? (
              <NumberField label="Center (% of the wall)" value={value.at} onChange={set('at')} />
            ) : (
              <LengthField label="Corner to the near edge" value={value.at} onChange={set('at')} />
            )}
            <LengthField label="Width" value={value.width} onChange={set('width')} />
          </>
        )}
      </Group>
      <Group title="Slope" brief={`1 in ${value.slope}${value.belowGrade > 0 ? `, foot ${formatInches(value.belowGrade)} below grade` : ''}`}>
        <NumberField label="Slope: run per 1 of rise" value={value.slope} onChange={set('slope')} />
        <LengthField label="Foot below grade" value={value.belowGrade} onChange={set('belowGrade')} />
      </Group>
      <Group
        title="Build"
        brief={value.material === 'concrete' ? `Concrete, ${formatInches(value.thickness)} base` : `${value.stringer} stringers at ${value.oc}"`}
      >
        <SelectField label="Material" value={value.material} options={RAMP_MATERIALS} describe={(material) => MATERIAL_LABELS[material]} onChange={set('material')} />
        {value.material === 'concrete' ? (
          <LengthField label="Thickness under the foot" value={value.thickness} onChange={set('thickness')} />
        ) : (
          <>
            <SelectField label="Stringers" value={value.stringer} options={TWO_BY} onChange={set('stringer')} />
            <SelectField label="Stringer spacing" value={value.oc} options={SPACINGS} describe={(oc) => `${oc}" o.c.`} onChange={set('oc')} />
          </>
        )}
      </Group>
    </Card>
  );
}
