import { LUMBER_SIZES, SHEETS, SHEET_KEYS, SPECIES, SPECIES_KEYS, TWO_BY, stockLengths } from '../core/catalog';
import {
  CORNERS,
  FASCIA,
  FOUNDATION_TYPES,
  FRONTS,
  LOFT_OPEN_ENDS,
  LOFT_SUPPORTS,
  LOFT_USES,
  MUD_SILLS,
  PIER_DIAMETERS,
  PURLINS,
  ROOF_DEAD_LOADS,
  ROOF_LOADS,
  POST_SIZES,
  ROOF_STYLES,
  ROOFING,
  SHEATHING,
  SKID_SIZES,
  SPACINGS,
  STUD_HEIGHTS,
  TAIL_CUTS,
  THROUGH,
  WALL_STUDS,
  WALLS,
  type ShedConfig,
} from '../core/config';
import {
  AutoLengthField,
  CheckField,
  Group,
  LengthField,
  LengthListField,
  NumberField,
  Section,
  SelectField,
  TextField,
  capitalize,
  setter,
  type Edit,
  type SectionProps,
} from './fields';
import { studLengths, wallTops, type Wall } from '../core/gen/walls';
import { naming, type Naming } from '../core/naming';
import { formatInches, formatLength } from '../core/units';
import { AdditionsEditor } from './AdditionsEditor';
import { OpeningRowsEditor, OpeningTypesEditor } from './OpeningsEditor';

type Foundation = ShedConfig['foundation'];
type Floor = ShedConfig['floor'];
type Walls = ShedConfig['walls'];
type Roof = ShedConfig['roof'];
type Catalog = ShedConfig['catalog'];

const ROOFING_LABELS = {
  shingles: 'Shingles on sheathing',
  metal: 'Metal on purlins, open',
  'metal-over-sheathing': 'Metal on purlins over sheathing',
};
const ROOF_DEAD_LABELS = { 10: '10 psf: asphalt shingles', 15: '15 psf: slate to 1/4"', 20: '20 psf: clay tile' };
const LOFT_USE_LABELS = { storage: 'Storage (20 psf)', sleeping: 'Sleeping (30 psf)' };

const MUD_SILL_LABELS: Record<string, string> = { none: 'None: PT bottom plate', match: 'Same as wall stud' };
const LOFT_SUPPORT_LABELS = { plates: 'On the wall plates', hung: 'Hung from ledgers' };

const CORNER_LABELS = {
  'four-stud': '4-stud post',
  'three-stud': '3-stud',
  california: 'California',
  'two-stud': '2-stud + clips',
};

const FRONT_LABELS = { eave: 'Eave wall', gable: 'Gable end' };
// Precut studs by the wall they make.
const STUD_HEIGHT_LABELS: Record<(typeof STUD_HEIGHTS)[number], string> = {
  92.625: '8 ft (92-5/8")',
  104.625: '9 ft (104-5/8")',
  116.625: '10 ft (116-5/8")',
  custom: 'Custom',
};

const sheetLabel = (key: (typeof SHEATHING)[number]) => (key === 'none' ? 'None' : SHEETS[key].label);
const noneLabel = (option: string) => (option === 'none' ? 'None' : option);
const count = (number: number, one: string, many = `${one}s`) => (number === 0 ? 'None' : `${number} ${number === 1 ? one : many}`);
const spacing = (size: string, oc: number) => `${size} at ${oc}" o.c.`;
const every = (pairs: number) => (pairs === 1 ? 'every pair' : `every ${pairs} pairs`);

export function DesignForm({ value, onChange }: SectionProps<ShedConfig>) {
  const set = setter(value, onChange);
  const names = naming(value);
  // Width runs across the ridge, length along it; their directions follow the user's front.
  const gableFront = value.front === 'gable';
  return (
    <>
      <Section title="Shed" open>
        <TextField label="Name" value={value.name} onChange={set('name')} />
        <SelectField
          label="Front of the shed"
          value={value.front}
          options={FRONTS}
          describe={(front) => FRONT_LABELS[front]}
          onChange={set('front')}
        />
        <LengthField
          label={gableFront ? 'Width (left to right)' : 'Width (front to back)'}
          value={value.width}
          onChange={set('width')}
        />
        <LengthField
          label={gableFront ? 'Length (front to back)' : 'Length (left to right)'}
          value={value.length}
          onChange={set('length')}
        />
        <SelectField
          label="Wall height"
          value={value.studHeight}
          options={STUD_HEIGHTS}
          describe={(height) => STUD_HEIGHT_LABELS[height]}
          // A switch to custom starts from the current height, so the walls do not move.
          onChange={(studHeight) =>
            onChange({ ...value, studHeight, ...(studHeight === 'custom' && { wallHeight: wallTops(value).left }) })
          }
        />
        {value.studHeight === 'custom' && (
          <LengthField label="Floor to top of plates" value={value.wallHeight} onChange={set('wallHeight')} />
        )}
        <p className="muted hint">
          Floor to the top of the top plates: {formatLength(wallTops(value).left)}. Studs:{' '}
          {formatInches(studLengths(value).left)}
          {value.studHeight === 'custom' ? ', cut to length.' : ' precuts.'}
        </p>
      </Section>
      <FoundationSection value={value.foundation} onChange={set('foundation')} />
      {value.foundation.type !== 'slab' && <FloorSection value={value.floor} onChange={set('floor')} />}
      <WallsSection value={value.walls} onChange={set('walls')} onSlab={value.foundation.type === 'slab'} gable={value.roof.style === 'gable'} names={names} />
      <OpeningsSection value={value} onChange={onChange} />
      <RoofSection value={value.roof} onChange={set('roof')} names={names} />
      {value.roof.style === 'gable' && <LoftSection value={value.roof} onChange={set('roof')} names={names} />}
      <Section title="Lean-tos" brief={count(value.additions.length, 'lean-to')}>
        <AdditionsEditor value={value} onChange={onChange} />
      </Section>
      <LoadsSection value={value} onChange={onChange} />
      <CatalogSection value={value.catalog} onChange={set('catalog')} />
    </>
  );
}

const FOUNDATION_BRIEFS: Record<Foundation['type'], (foundation: Foundation) => string> = {
  skid: ({ skid }) => `${skid.count} ${skid.size} skids`,
  pier: ({ pier }) => `Piers, ${pier.girderCount} ${pier.girder} girders`,
  slab: ({ slab }) => `${formatInches(slab.thickness)} slab`,
};

function FoundationSection({ value, onChange }: SectionProps<Foundation>) {
  const set = setter(value, onChange);
  const skid = setter(value.skid, set('skid'));
  const pier = setter(value.pier, set('pier'));
  const slab = setter(value.slab, set('slab'));
  return (
    <Section title="Foundation" brief={FOUNDATION_BRIEFS[value.type](value)}>
      <SelectField label="Type" value={value.type} options={FOUNDATION_TYPES} describe={capitalize} onChange={set('type')} />
      {value.type === 'skid' && (
        <>
          <SelectField label="Skid size" value={value.skid.size} options={SKID_SIZES} onChange={skid('size')} />
          <NumberField label="Skid count" value={value.skid.count} onChange={skid('count')} />
        </>
      )}
      {value.type === 'pier' && (
        <>
          <SelectField label="Pier diameter (in)" value={value.pier.diameter} options={PIER_DIAMETERS} onChange={pier('diameter')} />
          <LengthField label="Depth below grade" value={value.pier.depth} onChange={pier('depth')} />
          <LengthField label="Height above grade" value={value.pier.aboveGrade} onChange={pier('aboveGrade')} />
          <SelectField label="Post" value={value.pier.post} options={POST_SIZES} describe={noneLabel} onChange={pier('post')} />
          {value.pier.post !== 'none' && (
            <LengthField label="Post length" value={value.pier.postLength} onChange={pier('postLength')} />
          )}
          <SelectField label="Girder" value={value.pier.girder} options={LUMBER_SIZES} onChange={pier('girder')} />
          <NumberField label="Girder plies" value={value.pier.girderPlies} onChange={pier('girderPlies')} />
          <NumberField label="Girder count" value={value.pier.girderCount} onChange={pier('girderCount')} />
          <LengthField label="Max pier spacing" value={value.pier.maxSpacing} onChange={pier('maxSpacing')} />
        </>
      )}
      {value.type === 'slab' && (
        <>
          <LengthField label="Thickness" value={value.slab.thickness} onChange={slab('thickness')} />
          <CheckField label="Thickened edge" value={value.slab.thickenedEdge} onChange={slab('thickenedEdge')} />
          {value.slab.thickenedEdge && (
            <>
              <LengthField label="Edge width" value={value.slab.edgeWidth} onChange={slab('edgeWidth')} />
              <LengthField label="Edge depth" value={value.slab.edgeDepth} onChange={slab('edgeDepth')} />
            </>
          )}
          <LengthField label="Anchor bolt spacing" value={value.slab.anchorSpacing} onChange={slab('anchorSpacing')} />
          <LengthField label="Bolt to plate end" value={value.slab.anchorEndDistance} onChange={slab('anchorEndDistance')} />
        </>
      )}
    </Section>
  );
}

function FloorSection({ value, onChange }: SectionProps<Floor>) {
  const set = setter(value, onChange);
  return (
    <Section title="Floor" brief={spacing(value.joist, value.oc)}>
      <SelectField label="Joist" value={value.joist} options={TWO_BY} onChange={set('joist')} />
      <SelectField label="Joist o.c. (in)" value={value.oc} options={SPACINGS} onChange={set('oc')} />
      <CheckField label="Pressure treated" value={value.treated} onChange={set('treated')} />
      <CheckField label="Mid-span blocking" value={value.blocking} onChange={set('blocking')} />
      <SelectField label="Subfloor" value={value.subfloor} options={SHEET_KEYS} describe={sheetLabel} onChange={set('subfloor')} />
    </Section>
  );
}

function WallsSection({ value, onChange, onSlab, gable, names }: SectionProps<Walls> & { onSlab: boolean; gable: boolean; names: Naming }) {
  const set = setter(value, onChange);
  // The user's names for a wall pair, front before back and left before right.
  const pair = (walls: Wall[], kind: string) => {
    const [first, second] = walls.map(names.side).sort((one, other) => WALLS.indexOf(one) - WALLS.indexOf(other));
    return `${capitalize(first)} and ${second} (${kind})`;
  };
  const throughLabels = { ends: pair(['left', 'right'], 'gable ends'), eaves: pair(['front', 'back'], 'eaves') };
  return (
    <Section title="Walls" brief={spacing(value.stud, value.oc)}>
      <SelectField label="Stud" value={value.stud} options={WALL_STUDS} onChange={set('stud')} />
      <SelectField label="Stud o.c. (in)" value={value.oc} options={SPACINGS} onChange={set('oc')} />
      {onSlab && (
        <SelectField
          label="Mud sill"
          value={value.mudSill}
          options={MUD_SILLS}
          describe={(size) => MUD_SILL_LABELS[size] ?? size}
          onChange={set('mudSill')}
        />
      )}
      <CheckField label="Cap plate" value={value.capPlate} onChange={set('capPlate')} />
      <SelectField label="Corner" value={value.corner} options={CORNERS} describe={(corner) => CORNER_LABELS[corner]} onChange={set('corner')} />
      {gable && (
        <SelectField label="Corner posts on" value={value.through} options={THROUGH} describe={(walls) => throughLabels[walls]} onChange={set('through')} />
      )}
      <SelectField label="Sheathing" value={value.sheathing} options={SHEATHING} describe={sheetLabel} onChange={set('sheathing')} />
    </Section>
  );
}

function OpeningsSection({ value, onChange }: SectionProps<ShedConfig>) {
  const walls = setter(value.walls, setter(value, onChange)('walls'));
  const placed = value.openings.filter((row) => row.enabled).reduce((sum, row) => sum + row.at.length, 0);
  return (
    <Section title="Openings" brief={count(placed, 'opening')}>
      <OpeningRowsEditor value={value} onChange={onChange} />
      <Group title="Opening types" brief={count(value.openingTypes.length, 'type')} open={value.openingTypes.length === 0}>
        <OpeningTypesEditor value={value} onChange={onChange} />
      </Group>
      <Group title="Header and jack defaults" brief={`${value.walls.header} headers`}>
        <SelectField label="Default header" value={value.walls.header} options={TWO_BY} onChange={walls('header')} />
        <LengthField label="2 jacks when RO over" value={value.walls.doubleJackOver} onChange={walls('doubleJackOver')} />
        <SelectField label="Rough sill plies" value={value.walls.sillPlies} options={[1, 2]} onChange={walls('sillPlies')} />
      </Group>
    </Section>
  );
}

function RoofSection({ value, onChange, names }: SectionProps<Roof> & { names: Naming }) {
  const set = setter(value, onChange);
  const ladder = setter(value.rakeLadder, set('rakeLadder'));
  const ties = setter(value.rafterTies, set('rafterTies'));
  const collar = setter(value.collarTies, set('collarTies'));
  const gable = value.style === 'gable';
  return (
    <Section title="Roof" brief={`${capitalize(value.style)}, ${value.pitch}/12, ${spacing(value.rafter, value.oc)}`}>
      <SelectField label="Style" value={value.style} options={ROOF_STYLES} describe={capitalize} onChange={set('style')} />
      {value.style === 'lean-to' && (
        <SelectField
          label="High side"
          value={value.highSide}
          options={['front', 'back'] as const}
          describe={(side) => capitalize(names.side(side))}
          onChange={set('highSide')}
        />
      )}
      <NumberField label="Pitch (in / 12)" value={value.pitch} onChange={set('pitch')} />
      <SelectField label="Rafter" value={value.rafter} options={TWO_BY} onChange={set('rafter')} />
      <SelectField label="Rafter o.c. (in)" value={value.oc} options={SPACINGS} onChange={set('oc')} />
      {gable && <SelectField label="Ridge board" value={value.ridge} options={TWO_BY} onChange={set('ridge')} />}
      <CheckField label="Build the gable ends as panels" value={value.gablePanel} onChange={set('gablePanel')} />

      <Group title="Overhangs" brief={`${formatInches(value.eaveOverhang)} eaves, ${formatInches(value.rakeOverhang)} rakes`}>
        <LengthField label="Eave overhang" value={value.eaveOverhang} onChange={set('eaveOverhang')} />
        <SelectField label="Tail cut" value={value.tailCut} options={TAIL_CUTS} describe={capitalize} onChange={set('tailCut')} />
        <SelectField label="Fascia" value={value.fascia} options={FASCIA} describe={noneLabel} onChange={set('fascia')} />
        <LengthField label="Rake overhang" value={value.rakeOverhang} onChange={set('rakeOverhang')} />
      </Group>
      {/* The model frames a rake ladder from 1-1/2 in of rake overhang. */}
      {value.rakeOverhang >= 1.5 && (
        <Group title="Rake ladder" brief={`${value.rakeLadder.size}, lookouts at ${value.rakeLadder.spacing}" o.c.`}>
          <SelectField label="Ladder" value={value.rakeLadder.size} options={TWO_BY} onChange={ladder('size')} />
          <SelectField label="Lookout o.c. (in)" value={value.rakeLadder.spacing} options={SPACINGS} onChange={ladder('spacing')} />
          {gable && (
            <CheckField label="Ridge runs out to the fly rafters" value={value.rakeLadder.ridgeExtends} onChange={ladder('ridgeExtends')} />
          )}
          <CheckField label="Lookout at the fascia" value={value.rakeLadder.fasciaLookouts} onChange={ladder('fasciaLookouts')} />
          <CheckField label="Build the ladder on the gable-end rafter" value={value.rakeLadder.onEndRafter} onChange={ladder('onEndRafter')} />
        </Group>
      )}
      <Group title="Roofing" brief={ROOFING_LABELS[value.roofing]}>
        <SelectField label="Sheathing" value={value.sheathing} options={SHEATHING} describe={sheetLabel} onChange={set('sheathing')} />
        <SelectField label="Roofing" value={value.roofing} options={ROOFING} describe={(roofing) => ROOFING_LABELS[roofing]} onChange={set('roofing')} />
        {value.roofing !== 'shingles' && (
          <>
            <SelectField label="Purlins" value={value.purlin} options={PURLINS} describe={(size) => `${size} flat`} onChange={set('purlin')} />
            <LengthField label="Purlin spacing" value={value.purlinSpacing} onChange={set('purlinSpacing')} />
          </>
        )}
      </Group>

      {gable &&
        (value.loft.enabled ? (
          <p className="muted hint">The loft joists tie the rafters.</p>
        ) : (
          <Group
            title="Rafter ties"
            enabled={value.rafterTies.enabled}
            onEnable={ties('enabled')}
            brief={`${value.rafterTies.size}, ${every(value.rafterTies.every)}`}
          >
            <SelectField label="Size" value={value.rafterTies.size} options={TWO_BY} onChange={ties('size')} />
            <NumberField label="Every Nth pair" value={value.rafterTies.every} onChange={ties('every')} />
            <LengthField label="Height above plate" value={value.rafterTies.height} onChange={ties('height')} />
          </Group>
        ))}
      {gable && (
        <Group
          title="Collar ties"
          enabled={value.collarTies.enabled}
          onEnable={collar('enabled')}
          brief={`${value.collarTies.size}, ${every(value.collarTies.every)}`}
        >
          <SelectField label="Size" value={value.collarTies.size} options={TWO_BY} onChange={collar('size')} />
          <NumberField label="Every Nth pair" value={value.collarTies.every} onChange={collar('every')} />
          <AutoLengthField label="Height above plate" value={value.collarTies.height} onChange={collar('height')} />
        </Group>
      )}
    </Section>
  );
}

// The loft is a gable-roof option, so it lives in the roof config.
function LoftSection({ value, onChange, names }: SectionProps<Roof> & { names: Naming }) {
  const set = setter(value, onChange);
  const loft = setter(value.loft, set('loft'));
  const open = setter(value.loft.open, loft('open'));
  const knee = setter(value.kneeWalls, set('kneeWalls'));
  return (
    <Section
      title="Loft"
      enabled={value.loft.enabled}
      onEnable={loft('enabled')}
      brief={`${spacing(value.loft.joist, value.loft.oc)}${value.kneeWalls.enabled ? ', knee walls' : ''}`}
    >
      <SelectField label="Joist" value={value.loft.joist} options={TWO_BY} onChange={loft('joist')} />
      <SelectField label="Joist o.c. (in)" value={value.loft.oc} options={SPACINGS} onChange={loft('oc')} />
      <SelectField
        label="Joist support"
        value={value.loft.support}
        options={LOFT_SUPPORTS}
        describe={(support) => LOFT_SUPPORT_LABELS[support]}
        onChange={loft('support')}
      />
      <SelectField label="Deck" value={value.loft.deck} options={SHEET_KEYS} describe={sheetLabel} onChange={loft('deck')} />
      <SelectField
        label="Open end"
        value={value.loft.open.end}
        options={LOFT_OPEN_ENDS}
        describe={(end) => (end === 'none' ? 'None' : capitalize(names.side(end)))}
        onChange={open('end')}
      />
      {value.loft.open.end !== 'none' && <LengthField label="Open length" value={value.loft.open.length} onChange={open('length')} />}
      <Group
        title="Knee walls"
        enabled={value.kneeWalls.enabled}
        onEnable={knee('enabled')}
        brief={`${formatLength(value.kneeWalls.height)}, ${value.kneeWalls.stud}`}
      >
        <LengthField label="Height" value={value.kneeWalls.height} onChange={knee('height')} />
        <SelectField label="Stud" value={value.kneeWalls.stud} options={WALL_STUDS} onChange={knee('stud')} />
      </Group>
      <Group title="Hatches" brief={count(value.loft.hatches.length, 'hatch', 'hatches')}>
        <HatchesEditor value={value.loft.hatches} onChange={loft('hatches')} names={names} />
      </Group>
    </Section>
  );
}

// Species lives in the catalog but shows here, with the loads it is checked under.
function LoadsSection({ value, onChange }: SectionProps<ShedConfig>) {
  const loads = setter(value.loads, setter(value, onChange)('loads'));
  const catalog = setter(value.catalog, setter(value, onChange)('catalog'));
  return (
    <Section title="Loads and species" brief={`${value.loads.roof} psf roof, ${value.catalog.species.toUpperCase()}`}>
      <SelectField
        label="Lumber"
        value={value.catalog.species}
        options={SPECIES_KEYS}
        describe={(species) => SPECIES[species].label}
        onChange={catalog('species')}
      />
      <SelectField
        label="Roof load"
        value={value.loads.roof}
        options={ROOF_LOADS}
        describe={(load) => (load === 20 ? '20 psf roof live, no snow' : `${load} psf roof snow`)}
        onChange={loads('roof')}
      />
      <p className="muted hint">Use the design roof snow load from your building department, not the ground snow load.</p>
      <SelectField
        label="Roof dead load"
        value={value.loads.roofDead}
        options={ROOF_DEAD_LOADS}
        describe={(load) => ROOF_DEAD_LABELS[load]}
        onChange={loads('roofDead')}
      />
      {value.roof.loft.enabled && (
        <SelectField
          label="Loft use"
          value={value.loads.loft}
          options={LOFT_USES}
          describe={(use) => LOFT_USE_LABELS[use]}
          onChange={loads('loft')}
        />
      )}
      <p className="muted hint">
        Span checks use the AWC span table method with NDS 2018 design values. They are a check, not an engineered design.
      </p>
    </Section>
  );
}

function CatalogSection({ value, onChange }: SectionProps<Catalog>) {
  const set = setter(value, onChange);
  return (
    <Section title="Lumber catalog" brief={`Stock to ${formatLength(value.maxLength)}`}>
      <LengthField label="Saw kerf" value={value.kerf} onChange={set('kerf')} />
      <LengthField label="Longest stock" value={value.maxLength} onChange={set('maxLength')} />
      <p className="muted hint">
        Plates, rims, ridges, fascia, and girders splice at this length. Other pieces come from boards no longer than this.
      </p>
      <LengthField label="Longest one-piece stock" value={value.maxOnePiece} onChange={set('maxOnePiece')} />
      <p className="muted hint">
        A longer piece that cannot splice, such as a rafter tie, rafter, or joist, gets one board up to this length.
      </p>
      <p className="muted hint">Stock lengths per size. Clear a field to restore the default list.</p>
      {LUMBER_SIZES.map((size) => (
        <LengthListField
          key={size}
          label={size}
          value={stockLengths(value.stock, size)}
          onChange={(lengths) => {
            const stock = { ...value.stock };
            if (lengths.length) stock[size] = [...lengths];
            else delete stock[size];
            return set('stock')(stock);
          }}
        />
      ))}
    </Section>
  );
}

type Hatch = Roof['loft']['hatches'][number];

function HatchesEditor({ value, onChange, names }: SectionProps<Hatch[]> & { names: Naming }) {
  const update =
    (index: number): Edit<Hatch> =>
    (next) =>
      onChange(value.map((hatch, at) => (at === index ? next : hatch)));
  return (
    <>
      {value.map((hatch, index) => {
        const set = setter(hatch, update(index));
        return (
          <fieldset className="card" key={index}>
            <legend>Hatch {index + 1}</legend>
            <button
              className="remove"
              aria-label={`Remove hatch ${index + 1}`}
              onClick={() => onChange(value.filter((_, at) => at !== index))}
            >
              ×
            </button>
            <LengthField label={`From ${names.side('left')} end`} value={hatch.x} onChange={set('x')} />
            <LengthField label={`From ${names.side('front')} wall`} value={hatch.y} onChange={set('y')} />
            <LengthField label="Along the ridge" value={hatch.width} onChange={set('width')} />
            <LengthField label="Across the ridge" value={hatch.depth} onChange={set('depth')} />
          </fieldset>
        );
      })}
      <div className="add-row">
        <button onClick={() => onChange([...value, { x: 24, y: 24, width: 24, depth: 30 }])}>+ Hatch</button>
      </div>
    </>
  );
}
