import { useState } from 'react';
import { TWO_BY } from '../core/catalog';
import {
  ATTACHMENTS,
  FASCIA,
  LEAN_TO_FLOORS,
  LEAN_TO_POSTS,
  LEAN_TO_ROOFING,
  OPPOSITE,
  PURLINS,
  SPACINGS,
  WALLS,
  newAddition,
  type Addition,
  type ShedConfig,
} from '../core/config';
import { naming, type Naming } from '../core/naming';
import { formatLength } from '../core/units';
import { Card, CheckField, LengthField, NumberField, SelectField, capitalize, setter, type SectionProps } from './fields';

const FLOOR_LABELS = { none: 'None: posts on piers', slab: 'Slab' };
const ROOFING_LABELS = { sheathing: 'Sheathing', metal: 'Metal on purlins' };
const ATTACH_LABELS = { soffit: 'Below the main eave', extension: 'Extends the main roof' };
const sidesOf = ({ side, mirror }: Addition) => (mirror ? [side, OPPOSITE[side]] : [side]);

/** Open lean-tos on posts, one per side of the shed. */
export function AdditionsEditor({ value, onChange }: SectionProps<ShedConfig>) {
  const names = naming(value);
  const additions = value.additions;
  const setAll = (next: Addition[]) => onChange({ ...value, additions: next });
  const taken = new Set(additions.flatMap(sidesOf));
  const free = names.sides.find((side) => !taken.has(side));
  const [added, setAdded] = useState<number | null>(null);

  return (
    <>
      <p className="muted hint">
        Open lean-tos on posts, below the main roof's eave or rake. The ledger sits as high as the main roof allows.
      </p>
      {additions.map((addition, index) => (
        <AdditionCard
          key={index}
          open={index === added}
          value={addition}
          names={names}
          onChange={(next) => setAll(additions.map((other, at) => (at === index ? next : other)))}
          onRemove={() => setAll(additions.filter((_, at) => at !== index))}
        />
      ))}
      {free && (
        <div className="add-row">
          <button
            onClick={() => {
              setAll([...additions, newAddition(free)]);
              setAdded(additions.length);
            }}
          >
            + Lean-to
          </button>
        </div>
      )}
    </>
  );
}

function AdditionCard({
  value,
  open,
  names,
  onChange,
  onRemove,
}: SectionProps<Addition> & { open: boolean; names: Naming; onRemove: () => void }) {
  const set = setter(value, onChange);
  const extension = value.attach === 'extension';
  const side = capitalize(names.side(value.side));
  const title = value.mirror ? `${side} and ${names.side(OPPOSITE[value.side])} lean-tos` : `${side} lean-to`;
  return (
    <Card
      title={title}
      brief={`${formatLength(value.depth)} deep, ${value.pitch === 'main' ? 'main pitch' : `${value.pitch}/12`}`}
      open={open}
      actions={
        <button className="remove" aria-label={`Remove ${title}`} onClick={onRemove}>
          ×
        </button>
      }
    >
      <SelectField label="Side" value={value.side} options={WALLS} describe={(side) => capitalize(names.side(side))} onChange={set('side')} />
      <CheckField label="Mirror to the opposite side" value={value.mirror} onChange={set('mirror')} />
      <SelectField
        label="Attachment"
        value={value.attach}
        options={ATTACHMENTS}
        describe={(attach) => ATTACH_LABELS[attach]}
        // An extension takes over the whole eave.
        onChange={(attach) => onChange({ ...value, attach, ...(attach === 'extension' && { length: 'full' as const }) })}
      />
      {extension && <p className="muted hint">On an eave the main roof slopes down to. Its rafters lap the main rafters.</p>}
      <LengthField label="Depth (wall to post outside)" value={value.depth} onChange={set('depth')} />
      {!extension && (
        <CheckField
          label="Full wall length"
          value={value.length === 'full'}
          onChange={(full) => onChange({ ...value, length: full ? 'full' : 96 })}
        />
      )}
      {value.length !== 'full' && (
        <>
          <LengthField label="Length" value={value.length} onChange={set('length')} />
          <NumberField label="Center (% from left corner)" value={value.center} onChange={set('center')} />
        </>
      )}
      <CheckField
        label={extension ? 'Main roof plane' : 'Main roof pitch'}
        value={value.pitch === 'main'}
        onChange={(main) => onChange({ ...value, pitch: main ? 'main' : 3 })}
      />
      {value.pitch !== 'main' && <NumberField label="Pitch (in / 12)" value={value.pitch} onChange={set('pitch')} />}
      {!extension && <LengthField label="Ledger drop" value={value.drop} onChange={set('drop')} />}
      <SelectField label="Rafters" value={value.rafter} options={TWO_BY} onChange={set('rafter')} />
      <SelectField label="Rafter spacing" value={value.oc} options={SPACINGS} describe={(oc) => `${oc}" o.c.`} onChange={set('oc')} />
      <LengthField label="Eave overhang" value={value.eaveOverhang} onChange={set('eaveOverhang')} />
      <SelectField label="Fascia" value={value.fascia} options={FASCIA} describe={(size) => (size === 'none' ? 'None' : size)} onChange={set('fascia')} />
      <SelectField label="Roofing" value={value.roofing} options={LEAN_TO_ROOFING} describe={(roofing) => ROOFING_LABELS[roofing]} onChange={set('roofing')} />
      {value.roofing === 'metal' && (
        <>
          <SelectField label="Purlins" value={value.purlin} options={PURLINS} describe={(size) => `${size} flat`} onChange={set('purlin')} />
          <LengthField label="Purlin spacing" value={value.purlinSpacing} onChange={set('purlinSpacing')} />
        </>
      )}
      <SelectField label="Posts" value={value.post} options={LEAN_TO_POSTS} onChange={set('post')} />
      <LengthField label="Max post spacing" value={value.maxSpacing} onChange={set('maxSpacing')} />
      <SelectField label="Beam" value={value.beam} options={TWO_BY} onChange={set('beam')} />
      <SelectField label="Beam plies" value={value.beamPlies} options={[1, 2, 3]} onChange={set('beamPlies')} />
      <SelectField label="Floor" value={value.floor} options={LEAN_TO_FLOORS} describe={(floor) => FLOOR_LABELS[floor]} onChange={set('floor')} />
    </Card>
  );
}
