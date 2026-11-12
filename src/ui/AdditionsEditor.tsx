import { useState } from 'react';
import { DECK_BOARDS, TWO_BY } from '../core/catalog';
import {
  ATTACHMENTS,
  DECK_JOINS,
  DECK_SUPPORTS,
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
import { deckHeights, onShed } from '../core/gen/deck';
import { supportLines } from '../core/gen/supports';
import { naming, type Naming } from '../core/naming';
import { formatInches, formatLength } from '../core/units';
import { Card, CheckField, Group, LengthField, NumberField, SelectField, capitalize, setter, type SectionProps } from './fields';
import { EDITOR_HELP } from './help/editors';

const FLOOR_LABELS = { none: 'None: posts on piers', slab: 'Slab', deck: 'Deck: posts on piers' };
const FLOOR_BRIEFS = { none: 'None', slab: 'Slab', deck: 'Deck' };
const BOARD_LABELS = { '5/4x6': '5/4x6 decking, 1 in thick', '2x6': '2x6, 1-1/2 in thick' };
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
          config={value}
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
  config,
  names,
  onChange,
  onRemove,
}: SectionProps<Addition> & { open: boolean; config: ShedConfig; names: Naming; onRemove: () => void }) {
  const set = setter(value, onChange);
  const deck = setter(value.deck, set('deck'));
  const supports = supportLines(config);
  const shed = onShed(config, value);
  const lines = supports?.kind === 'skid' ? 'skids' : 'girders and piers';
  const gable = [value.side, ...(value.mirror ? [OPPOSITE[value.side]] : [])].some((side) => side === 'left' || side === 'right');
  // On the shed's skids or girders: the joist notch that sets the deck, or the deck height.
  const deckHeight = () => {
    const heights = deckHeights(config, { ...value, floor: 'deck' })!;
    const target = value.deck.drop > 0 ? `${formatInches(value.deck.drop)} below` : 'flush with';
    if (heights.notch > 0.01) return `The joists are notched ${formatInches(heights.notch)} at their bearings to set the deck ${target} the shed floor.`;
    return Math.abs(heights.top) < 0.01 ? 'The deck is level with the shed floor.' : `The deck is ${formatInches(-heights.top)} below the shed floor.`;
  };
  const extension = value.attach === 'extension';
  const side = capitalize(names.side(value.side));
  const title = value.mirror ? `${side} and ${names.side(OPPOSITE[value.side])} lean-tos` : `${side} lean-to`;
  return (
    <Card
      title={title}
      brief={`${formatLength(value.depth)} deep, ${value.pitch === 'main' ? 'main pitch' : `${value.pitch}/12`}${value.floor === 'none' ? '' : `, ${value.floor}`}`}
      open={open}
      actions={
        <button className="remove" aria-label={`Remove ${title}`} onClick={onRemove}>
          ×
        </button>
      }
    >
      <SelectField label="Side" value={value.side} options={WALLS} describe={(side) => capitalize(names.side(side))} onChange={set('side')} help={EDITOR_HELP['additions.side']} />
      <CheckField label="Mirror to the opposite side" value={value.mirror} onChange={set('mirror')} help={EDITOR_HELP['additions.mirror']} />
      <SelectField
        label="Attachment"
        value={value.attach}
        options={ATTACHMENTS}
        describe={(attach) => ATTACH_LABELS[attach]}
        // An extension takes over the whole eave.
        onChange={(attach) => onChange({ ...value, attach, ...(attach === 'extension' && { length: 'full' as const }) })}
        help={EDITOR_HELP['additions.attach']}
      />
      {extension && <p className="muted hint">On an eave the main roof slopes down to. Its rafters lap the main rafters.</p>}
      <Group title="Size" brief={`${formatLength(value.depth)} deep, ${value.length === 'full' ? 'full length' : `${formatLength(value.length)} long`}`}>
        <LengthField label="Depth (wall to post outside)" value={value.depth} onChange={set('depth')} help={EDITOR_HELP['additions.depth']} />
        {!extension && (
          <CheckField
            label="Full wall length"
            value={value.length === 'full'}
            onChange={(full) => onChange({ ...value, length: full ? 'full' : 96 })}
            help={EDITOR_HELP['additions.length:full']}
          />
        )}
        {value.length !== 'full' && (
          <>
            <LengthField label="Length" value={value.length} onChange={set('length')} help={EDITOR_HELP['additions.length']} />
            <NumberField label="Center (% from left corner)" value={value.center} onChange={set('center')} help={EDITOR_HELP['additions.center']} />
          </>
        )}
      </Group>
      <Group
        title="Roof"
        brief={`${value.pitch === 'main' ? 'Main pitch' : `${value.pitch}/12`}, ${value.rafter} at ${value.oc}", ${ROOFING_LABELS[value.roofing].toLowerCase()}`}
      >
        <CheckField
          label={extension ? 'Main roof plane' : 'Main roof pitch'}
          value={value.pitch === 'main'}
          onChange={(main) => onChange({ ...value, pitch: main ? 'main' : 3 })}
          help={EDITOR_HELP['additions.pitch:main']}
        />
        {value.pitch !== 'main' && <NumberField label="Pitch (in / 12)" value={value.pitch} onChange={set('pitch')} help={EDITOR_HELP['additions.pitch']} />}
        {!extension && <LengthField label="Ledger drop" value={value.drop} onChange={set('drop')} help={EDITOR_HELP['additions.drop']} />}
        <SelectField label="Rafters" value={value.rafter} options={TWO_BY} onChange={set('rafter')} help={EDITOR_HELP['additions.rafter']} />
        <SelectField label="Rafter spacing" value={value.oc} options={SPACINGS} describe={(oc) => `${oc}" o.c.`} onChange={set('oc')} help={EDITOR_HELP['additions.oc']} />
        <LengthField label="Eave overhang" value={value.eaveOverhang} onChange={set('eaveOverhang')} help={EDITOR_HELP['additions.eaveOverhang']} />
        <SelectField label="Fascia" value={value.fascia} options={FASCIA} describe={(size) => (size === 'none' ? 'None' : size)} onChange={set('fascia')} help={EDITOR_HELP['additions.fascia']} />
        <SelectField label="Roofing" value={value.roofing} options={LEAN_TO_ROOFING} describe={(roofing) => ROOFING_LABELS[roofing]} onChange={set('roofing')} help={EDITOR_HELP['additions.roofing']} />
        {value.roofing === 'metal' && (
          <>
            <SelectField label="Purlins" value={value.purlin} options={PURLINS} describe={(size) => `${size} flat`} onChange={set('purlin')} help={EDITOR_HELP['additions.purlin']} />
            <LengthField label="Purlin spacing" value={value.purlinSpacing} onChange={set('purlinSpacing')} help={EDITOR_HELP['additions.purlinSpacing']} />
          </>
        )}
      </Group>
      <Group title="Posts and beam" brief={`${value.post} posts, ${value.beamPlies}-ply ${value.beam}`}>
        <SelectField label="Posts" value={value.post} options={LEAN_TO_POSTS} onChange={set('post')} help={EDITOR_HELP['additions.post']} />
        <LengthField label="Max post spacing" value={value.maxSpacing} onChange={set('maxSpacing')} help={EDITOR_HELP['additions.maxSpacing']} />
        <SelectField label="Beam" value={value.beam} options={TWO_BY} onChange={set('beam')} help={EDITOR_HELP['additions.beam']} />
        <SelectField label="Beam plies" value={value.beamPlies} options={[1, 2, 3]} onChange={set('beamPlies')} help={EDITOR_HELP['additions.beamPlies']} />
      </Group>
      <Group title="Floor" brief={value.floor === 'deck' ? `Deck, ${value.deck.joist} at ${value.deck.oc}", on ${shed ? `the shed's ${supports?.kind === 'skid' ? 'skids' : 'girders'}` : 'piers'}` : FLOOR_BRIEFS[value.floor]}>
        <SelectField label="Floor" value={value.floor} options={LEAN_TO_FLOORS} describe={(floor) => FLOOR_LABELS[floor]} onChange={set('floor')} help={EDITOR_HELP['additions.floor']} />
        {value.floor === 'deck' && (
          <>
            <SelectField label="Deck joists" value={value.deck.joist} options={TWO_BY} onChange={deck('joist')} help={EDITOR_HELP['additions.deck.joist']} />
            <SelectField label="Deck joist spacing" value={value.deck.oc} options={SPACINGS} describe={(oc) => `${oc}" o.c.`} onChange={deck('oc')} help={EDITOR_HELP['additions.deck.oc']} />
            <SelectField label="Deck boards" value={value.deck.boards} options={DECK_BOARDS} describe={(boards) => BOARD_LABELS[boards]} onChange={deck('boards')} help={EDITOR_HELP['additions.deck.boards']} />
            {supports && (
              <SelectField
                label="Deck support"
                value={value.deck.support}
                options={DECK_SUPPORTS}
                describe={(support) => (support === 'piers' ? 'Piers under a beam' : `The shed's ${lines}, continued`)}
                onChange={deck('support')}
                help={EDITOR_HELP['additions.deck.support']}
              />
            )}
            {shed && gable && (
              <SelectField
                label="At the gable end"
                value={value.deck.join}
                options={DECK_JOINS}
                describe={(join) => (join === 'continue' ? `Run the shed's ${lines} on out` : `Own ${lines}, in line`)}
                onChange={deck('join')}
                help={EDITOR_HELP['additions.deck.join']}
              />
            )}
            <LengthField label="Deck below the shed floor" value={value.deck.drop} onChange={deck('drop')} help={EDITOR_HELP['additions.deck.drop']} />
            <p className="muted hint">
              {shed && supports
                ? `Joists on the ${lines}. ${deckHeight()} The posts stand on the deck beam.`
                : "Joists from a ledger on the shed's floor framing to a beam on the piers. The posts stand on the beam."}
            </p>
          </>
        )}
      </Group>
    </Card>
  );
}
