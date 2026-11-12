import {
  FRAMING_SIZES,
  LUMBER_SIZES,
  SHEETS,
  SHEET_KEYS,
  SPECIES,
  SPECIES_KEYS,
  TWO_BY,
  stockLengths,
  type LumberSize,
  type SheetKey,
} from '../core/catalog';
import {
  CORNERS,
  FASCIA,
  FASCIA_TOPS,
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
  SIDINGS,
  SKID_SIZES,
  SPACINGS,
  STUD_HEIGHTS,
  TAIL_CUTS,
  THROUGH,
  WALL_STUDS,
  WALLS,
  hasRidgeBoard,
  ridged,
  usesFasciaTop,
  withRoofStyle,
  type ShedConfig,
} from '../core/config';
import { useState, type ReactNode } from 'react';
import {
  AutoLengthField,
  Card,
  CheckField,
  ColorField,
  Group,
  LengthField,
  LengthListField,
  NumberField,
  PriceField,
  Section,
  SelectField,
  TextField,
  capitalize,
  setter,
  type Edit,
  type Help,
  type SectionProps,
} from './fields';
import { gambrelBreak } from '../core/gen/roof';
import { studLengths, wallTops, type Wall } from '../core/gen/walls';
import { naming, type Naming } from '../core/naming';
import { formatInches, formatLength, formatMoney } from '../core/units';
import { AdditionsEditor } from './AdditionsEditor';
import { OpeningRowsEditor, OpeningTypesEditor } from './OpeningsEditor';
import { RampsEditor } from './RampsEditor';
import { DESIGN_HELP } from './help/design';

type Foundation = ShedConfig['foundation'];
type Floor = ShedConfig['floor'];
type Walls = ShedConfig['walls'];
type Roof = ShedConfig['roof'];
type Catalog = ShedConfig['catalog'];

const SIDING_LABELS = { none: 'None', lap: 'Lap siding', 't1-11': 'T1-11', 'board-batten': 'Board and batten' };
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

const LUMBER_PRICE_LABELS = Object.fromEntries(LUMBER_SIZES.map((size) => [size, `${size}, per ft`])) as Record<LumberSize, string>;
const SHEET_PRICE_LABELS = Object.fromEntries(SHEET_KEYS.map((key) => [key, SHEETS[key].label])) as Record<SheetKey, string>;
const CONCRETE_PRICE_LABELS = { bag: '80 lb bag', readyMix: 'Ready-mix, per cu yd', formTube: 'Form tube' };
const HARDWARE_PRICE_LABELS = {
  anchorBolt: 'Anchor bolt',
  hurricaneTie: 'Hurricane tie',
  postBase: 'Post base',
  postCap: 'Post cap',
  joistHanger: 'Joist hanger',
  doubleHanger: 'Double joist hanger',
  lag: 'Lag screw',
};
const ROOFING_PRICE_LABELS = { shingles: 'Shingles, per sq ft', metal: 'Metal panels, per sq ft', dripEdge: 'Drip edge, per ft' };

const sheetLabel = (key: (typeof SHEATHING)[number]) => (key === 'none' ? 'None' : SHEETS[key].label);
const noneLabel = (option: string) => (option === 'none' ? 'None' : option);
const count = (number: number, one: string, many = `${one}s`) => (number === 0 ? 'None' : `${number} ${number === 1 ? one : many}`);
const spacing = (size: string, oc: number) => `${size} at ${oc}" o.c.`;
const every = (pairs: number) => (pairs === 1 ? 'every pair' : `every ${pairs} pairs`);

const FASCIA_TOP_LABELS = { 'set-down': 'Set down under the roof', beveled: 'Bevel ripped to the pitch', flush: 'Flush with the rafter tops' } as const;

export function DesignForm({ value, onChange }: SectionProps<ShedConfig>) {
  const set = setter(value, onChange);
  const names = naming(value);
  // Width runs across the ridge, length along it; their directions follow the user's front.
  const gableFront = value.front === 'gable';
  return (
    <>
      <Section title="Shed" open>
        <TextField label="Name" value={value.name} onChange={set('name')} help={DESIGN_HELP['name']} />
        <SelectField
          label="Front of the shed"
          value={value.front}
          options={FRONTS}
          describe={(front) => FRONT_LABELS[front]}
          onChange={set('front')}
          help={DESIGN_HELP['front']}
        />
        <LengthField
          label={gableFront ? 'Width (left to right)' : 'Width (front to back)'}
          value={value.width}
          onChange={set('width')}
          help={DESIGN_HELP['width']}
        />
        <LengthField
          label={gableFront ? 'Length (front to back)' : 'Length (left to right)'}
          value={value.length}
          onChange={set('length')}
          help={DESIGN_HELP['length']}
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
          help={DESIGN_HELP['studHeight']}
        />
        {value.studHeight === 'custom' && (
          <LengthField label="Floor to top of plates" value={value.wallHeight} onChange={set('wallHeight')} help={DESIGN_HELP['wallHeight']} />
        )}
        <p className="muted hint">
          Floor to the top of the top plates: {formatLength(wallTops(value).left)}. Studs:{' '}
          {formatInches(studLengths(value).left)}
          {value.studHeight === 'custom' ? ', cut to length.' : ' precuts.'}
        </p>
      </Section>
      <FoundationSection
        value={value.foundation}
        onChange={set('foundation')}
        leanToPiers={value.additions.some(({ floor }) => floor !== 'slab')}
        leanToSlab={value.additions.some(({ floor }) => floor === 'slab')}
      />
      {value.foundation.type !== 'slab' && <FloorSection value={value.floor} onChange={set('floor')} />}
      <WallsSection value={value.walls} onChange={set('walls')} onSlab={value.foundation.type === 'slab'} gable={ridged(value.roof)} names={names} />
      <OpeningsSection value={value} onChange={onChange} />
      <RoofSection
        value={value.roof}
        onChange={set('roof')}
        names={names}
        gambrelBreak={value.roof.style === 'gambrel' ? gambrelBreak(value) : null}
        fasciaTop={usesFasciaTop(value)}
      />
      {ridged(value.roof) && <LoftSection value={value.roof} onChange={set('roof')} names={names} />}
      <Section title="Lean-tos" brief={count(value.additions.length, 'lean-to')}>
        <AdditionsEditor value={value} onChange={onChange} />
      </Section>
      <Section title="Ramps" brief={count(value.ramps.length, 'ramp')}>
        <RampsEditor value={value} onChange={onChange} />
      </Section>
      <FinishesSection value={value} onChange={onChange} />
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

// Lean-to posts stand on piers, or on a slab, sized here even when the shed has another foundation.
function FoundationSection({ value, onChange, leanToPiers, leanToSlab }: SectionProps<Foundation> & { leanToPiers: boolean; leanToSlab: boolean }) {
  const set = setter(value, onChange);
  const skid = setter(value.skid, set('skid'));
  const pier = setter(value.pier, set('pier'));
  const slab = setter(value.slab, set('slab'));
  return (
    <Section title="Foundation" brief={FOUNDATION_BRIEFS[value.type](value)}>
      <SelectField label="Type" value={value.type} options={FOUNDATION_TYPES} describe={capitalize} onChange={set('type')} help={DESIGN_HELP['foundation.type']} />
      {value.type === 'skid' && (
        <>
          <SelectField label="Skid size" value={value.skid.size} options={SKID_SIZES} onChange={skid('size')} help={DESIGN_HELP['foundation.skid.size']} />
          <NumberField label="Skid count" value={value.skid.count} onChange={skid('count')} help={DESIGN_HELP['foundation.skid.count']} />
        </>
      )}
      {value.type === 'pier' && (
        <>
          <SelectField label="Pier diameter (in)" value={value.pier.diameter} options={PIER_DIAMETERS} onChange={pier('diameter')} help={DESIGN_HELP['foundation.pier.diameter']} />
          <LengthField label="Depth below grade" value={value.pier.depth} onChange={pier('depth')} help={DESIGN_HELP['foundation.pier.depth']} />
          <LengthField label="Height above grade" value={value.pier.aboveGrade} onChange={pier('aboveGrade')} help={DESIGN_HELP['foundation.pier.aboveGrade']} />
          <SelectField label="Post" value={value.pier.post} options={POST_SIZES} describe={noneLabel} onChange={pier('post')} help={DESIGN_HELP['foundation.pier.post']} />
          {value.pier.post !== 'none' && (
            <LengthField label="Post length" value={value.pier.postLength} onChange={pier('postLength')} help={DESIGN_HELP['foundation.pier.postLength']} />
          )}
          <SelectField label="Girder" value={value.pier.girder} options={FRAMING_SIZES} onChange={pier('girder')} help={DESIGN_HELP['foundation.pier.girder']} />
          <NumberField label="Girder plies" value={value.pier.girderPlies} onChange={pier('girderPlies')} help={DESIGN_HELP['foundation.pier.girderPlies']} />
          <NumberField label="Girder count" value={value.pier.girderCount} onChange={pier('girderCount')} help={DESIGN_HELP['foundation.pier.girderCount']} />
          <LengthField label="Max pier spacing" value={value.pier.maxSpacing} onChange={pier('maxSpacing')} help={DESIGN_HELP['foundation.pier.maxSpacing']} />
        </>
      )}
      {value.type === 'slab' && (
        <>
          <LengthField label="Thickness" value={value.slab.thickness} onChange={slab('thickness')} help={DESIGN_HELP['foundation.slab.thickness']} />
          <CheckField label="Thickened edge" value={value.slab.thickenedEdge} onChange={slab('thickenedEdge')} help={DESIGN_HELP['foundation.slab.thickenedEdge']} />
          {value.slab.thickenedEdge && (
            <>
              <LengthField label="Edge width" value={value.slab.edgeWidth} onChange={slab('edgeWidth')} help={DESIGN_HELP['foundation.slab.edgeWidth']} />
              <LengthField label="Edge depth" value={value.slab.edgeDepth} onChange={slab('edgeDepth')} help={DESIGN_HELP['foundation.slab.edgeDepth']} />
            </>
          )}
          <LengthField label="Anchor bolt spacing" value={value.slab.anchorSpacing} onChange={slab('anchorSpacing')} help={DESIGN_HELP['foundation.slab.anchorSpacing']} />
          <LengthField label="Bolt to plate end" value={value.slab.anchorEndDistance} onChange={slab('anchorEndDistance')} help={DESIGN_HELP['foundation.slab.anchorEndDistance']} />
        </>
      )}
      {value.type !== 'pier' && leanToPiers && (
        <Group title="Lean-to piers" brief={`${value.pier.diameter}" diameter`}>
          <SelectField label="Pier diameter (in)" value={value.pier.diameter} options={PIER_DIAMETERS} onChange={pier('diameter')} help={DESIGN_HELP['foundation.pier.diameter']} />
          <LengthField label="Depth below grade" value={value.pier.depth} onChange={pier('depth')} help={DESIGN_HELP['foundation.pier.depth']} />
          <LengthField label="Height above grade" value={value.pier.aboveGrade} onChange={pier('aboveGrade')} help={DESIGN_HELP['foundation.pier.aboveGrade']} />
        </Group>
      )}
      {value.type !== 'slab' && leanToSlab && (
        <Group title="Lean-to slab" brief={formatInches(value.slab.thickness)}>
          <LengthField label="Thickness" value={value.slab.thickness} onChange={slab('thickness')} help={DESIGN_HELP['foundation.slab.thickness']} />
        </Group>
      )}
    </Section>
  );
}

function FloorSection({ value, onChange }: SectionProps<Floor>) {
  const set = setter(value, onChange);
  return (
    <Section title="Floor" brief={spacing(value.joist, value.oc)}>
      <SelectField label="Joist" value={value.joist} options={TWO_BY} onChange={set('joist')} help={DESIGN_HELP['floor.joist']} />
      <SelectField label="Joist o.c. (in)" value={value.oc} options={SPACINGS} onChange={set('oc')} help={DESIGN_HELP['floor.oc']} />
      <CheckField label="Pressure treated" value={value.treated} onChange={set('treated')} help={DESIGN_HELP['floor.treated']} />
      <CheckField label="Mid-span blocking" value={value.blocking} onChange={set('blocking')} help={DESIGN_HELP['floor.blocking']} />
      <SelectField label="Subfloor" value={value.subfloor} options={SHEET_KEYS} describe={sheetLabel} onChange={set('subfloor')} help={DESIGN_HELP['floor.subfloor']} />
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
      <SelectField label="Stud" value={value.stud} options={WALL_STUDS} onChange={set('stud')} help={DESIGN_HELP['walls.stud']} />
      <SelectField label="Stud o.c. (in)" value={value.oc} options={SPACINGS} onChange={set('oc')} help={DESIGN_HELP['walls.oc']} />
      {onSlab && (
        <SelectField
          label="Mud sill"
          value={value.mudSill}
          options={MUD_SILLS}
          describe={(size) => MUD_SILL_LABELS[size] ?? size}
          onChange={set('mudSill')}
          help={DESIGN_HELP['walls.mudSill']}
        />
      )}
      <CheckField label="Cap plate" value={value.capPlate} onChange={set('capPlate')} help={DESIGN_HELP['walls.capPlate']} />
      <SelectField label="Corner" value={value.corner} options={CORNERS} describe={(corner) => CORNER_LABELS[corner]} onChange={set('corner')} help={DESIGN_HELP['walls.corner']} />
      {gable && (
        <SelectField label="Corner posts on" value={value.through} options={THROUGH} describe={(walls) => throughLabels[walls]} onChange={set('through')} help={DESIGN_HELP['walls.through']} />
      )}
      <SelectField label="Sheathing" value={value.sheathing} options={SHEATHING} describe={sheetLabel} onChange={set('sheathing')} help={DESIGN_HELP['walls.sheathing']} />
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
        <SelectField label="Default header" value={value.walls.header} options={TWO_BY} onChange={walls('header')} help={DESIGN_HELP['walls.header']} />
        <LengthField label="2 jacks when RO over" value={value.walls.doubleJackOver} onChange={walls('doubleJackOver')} help={DESIGN_HELP['walls.doubleJackOver']} />
        <SelectField label="Rough sill plies" value={value.walls.sillPlies} options={[1, 2]} onChange={walls('sillPlies')} help={DESIGN_HELP['walls.sillPlies']} />
      </Group>
    </Section>
  );
}

function RoofSection({
  value,
  onChange,
  names,
  gambrelBreak,
  fasciaTop,
}: SectionProps<Roof> & { names: Naming; gambrelBreak: { run: number; height: number } | null; fasciaTop: boolean }) {
  const set = setter(value, onChange);
  const ladder = setter(value.rakeLadder, set('rakeLadder'));
  const ties = setter(value.rafterTies, set('rafterTies'));
  const collar = setter(value.collarTies, set('collarTies'));
  const gambrel = setter(value.gambrel, set('gambrel'));
  // Two sides meeting at a ridge: gable or gambrel.
  const gable = ridged(value);
  const pitches = value.style === 'gambrel' ? `${value.gambrel.lowerPitch}/12 and ${value.pitch}/12` : `${value.pitch}/12`;
  return (
    <Section title="Roof" brief={`${capitalize(value.style)}, ${pitches}, ${spacing(value.rafter, value.oc)}`}>
      <SelectField label="Style" value={value.style} options={ROOF_STYLES} describe={capitalize} onChange={(style) => onChange(withRoofStyle(value, style))} help={DESIGN_HELP['roof.style']} />
      {value.style === 'lean-to' && (
        <SelectField
          label="High side"
          value={value.highSide}
          options={['front', 'back'] as const}
          describe={(side) => capitalize(names.side(side))}
          onChange={set('highSide')}
          help={DESIGN_HELP['roof.highSide']}
        />
      )}
      {gambrelBreak && <NumberField label="Lower pitch (in / 12)" value={value.gambrel.lowerPitch} onChange={gambrel('lowerPitch')} help={DESIGN_HELP['roof.gambrel.lowerPitch']} />}
      <NumberField label={gambrelBreak ? 'Upper pitch (in / 12)' : 'Pitch (in / 12)'} value={value.pitch} onChange={set('pitch')} help={DESIGN_HELP['roof.pitch']} />
      {gambrelBreak && (
        <>
          <AutoLengthField label="Break, in from the wall" value={value.gambrel.breakRun} onChange={gambrel('breakRun')} help={DESIGN_HELP['roof.gambrel.breakRun']} />
          <p className="muted hint">
            The break is {formatInches(gambrelBreak.run)} in from the wall, {formatLength(gambrelBreak.height)} above the floor at the rafter tops. Plywood
            gussets join the rafters there{value.gambrel.ridgeBoard ? '' : ' and at the peak'}.
          </p>
          <CheckField label="Ridge board" value={value.gambrel.ridgeBoard} onChange={gambrel('ridgeBoard')} help={DESIGN_HELP['roof.gambrel.ridgeBoard']} />
        </>
      )}
      <SelectField label="Rafter" value={value.rafter} options={TWO_BY} onChange={set('rafter')} help={DESIGN_HELP['roof.rafter']} />
      <SelectField label="Rafter o.c. (in)" value={value.oc} options={SPACINGS} onChange={set('oc')} help={DESIGN_HELP['roof.oc']} />
      {hasRidgeBoard(value) && <SelectField label="Ridge board" value={value.ridge} options={TWO_BY} onChange={set('ridge')} help={DESIGN_HELP['roof.ridge']} />}
      <CheckField label="Build the gable ends as panels" value={value.gablePanel} onChange={set('gablePanel')} help={DESIGN_HELP['roof.gablePanel']} />

      <Group title="Overhangs" brief={`${formatInches(value.eaveOverhang)} eaves, ${formatInches(value.rakeOverhang)} rakes`}>
        <LengthField label="Eave overhang" value={value.eaveOverhang} onChange={set('eaveOverhang')} help={DESIGN_HELP['roof.eaveOverhang']} />
        <SelectField label="Tail cut" value={value.tailCut} options={TAIL_CUTS} describe={(cut) => (cut === 'plumb-level' ? 'Plumb and level' : capitalize(cut))} onChange={set('tailCut')} help={DESIGN_HELP['roof.tailCut']} />
        <SelectField label="Fascia" value={value.fascia} options={FASCIA} describe={noneLabel} onChange={set('fascia')} help={DESIGN_HELP['roof.fascia']} />
        {fasciaTop && (
          <SelectField label="Fascia top" value={value.fasciaTop} options={FASCIA_TOPS} describe={(top) => FASCIA_TOP_LABELS[top]} onChange={set('fasciaTop')} help={DESIGN_HELP['roof.fasciaTop']} />
        )}
        <LengthField label="Rake overhang" value={value.rakeOverhang} onChange={set('rakeOverhang')} help={DESIGN_HELP['roof.rakeOverhang']} />
      </Group>
      {/* The model frames a rake ladder from 1-1/2 in of rake overhang. */}
      {value.rakeOverhang >= 1.5 && (
        <Group title="Rake ladder" brief={`${value.rakeLadder.size}, lookouts at ${value.rakeLadder.spacing}" o.c.`}>
          <SelectField label="Ladder" value={value.rakeLadder.size} options={TWO_BY} onChange={ladder('size')} help={DESIGN_HELP['roof.rakeLadder.size']} />
          <SelectField label="Lookout o.c. (in)" value={value.rakeLadder.spacing} options={SPACINGS} onChange={ladder('spacing')} help={DESIGN_HELP['roof.rakeLadder.spacing']} />
          {hasRidgeBoard(value) && (
            <CheckField label="Ridge runs out to the fly rafters" value={value.rakeLadder.ridgeExtends} onChange={ladder('ridgeExtends')} help={DESIGN_HELP['roof.rakeLadder.ridgeExtends']} />
          )}
          <CheckField label="Lookout at the fascia" value={value.rakeLadder.fasciaLookouts} onChange={ladder('fasciaLookouts')} help={DESIGN_HELP['roof.rakeLadder.fasciaLookouts']} />
          <CheckField label="Build the ladder on the gable-end rafter" value={value.rakeLadder.onEndRafter} onChange={ladder('onEndRafter')} help={DESIGN_HELP['roof.rakeLadder.onEndRafter']} />
        </Group>
      )}
      <Group title="Roofing" brief={ROOFING_LABELS[value.roofing]}>
        <SelectField label="Sheathing" value={value.sheathing} options={SHEATHING} describe={sheetLabel} onChange={set('sheathing')} help={DESIGN_HELP['roof.sheathing']} />
        <SelectField label="Roofing" value={value.roofing} options={ROOFING} describe={(roofing) => ROOFING_LABELS[roofing]} onChange={set('roofing')} help={DESIGN_HELP['roof.roofing']} />
        {value.roofing !== 'shingles' && (
          <>
            <SelectField label="Purlins" value={value.purlin} options={PURLINS} describe={(size) => `${size} flat`} onChange={set('purlin')} help={DESIGN_HELP['roof.purlin']} />
            <LengthField label="Purlin spacing" value={value.purlinSpacing} onChange={set('purlinSpacing')} help={DESIGN_HELP['roof.purlinSpacing']} />
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
            onEnable={ties('enabled')} help={DESIGN_HELP['roof.rafterTies.enabled']}
            brief={`${value.rafterTies.size}, ${every(value.rafterTies.every)}`}
          >
            <SelectField label="Size" value={value.rafterTies.size} options={TWO_BY} onChange={ties('size')} help={DESIGN_HELP['roof.rafterTies.size']} />
            <NumberField label="Every Nth pair" value={value.rafterTies.every} onChange={ties('every')} help={DESIGN_HELP['roof.rafterTies.every']} />
            <LengthField label="Height above plate" value={value.rafterTies.height} onChange={ties('height')} help={DESIGN_HELP['roof.rafterTies.height']} />
          </Group>
        ))}
      {gable && (
        <Group
          title="Collar ties"
          enabled={value.collarTies.enabled}
          onEnable={collar('enabled')} help={DESIGN_HELP['roof.collarTies.enabled']}
          brief={`${value.collarTies.size}, ${every(value.collarTies.every)}`}
        >
          <SelectField label="Size" value={value.collarTies.size} options={TWO_BY} onChange={collar('size')} help={DESIGN_HELP['roof.collarTies.size']} />
          <NumberField label="Every Nth pair" value={value.collarTies.every} onChange={collar('every')} help={DESIGN_HELP['roof.collarTies.every']} />
          <AutoLengthField label="Height above plate" value={value.collarTies.height} onChange={collar('height')} help={DESIGN_HELP['roof.collarTies.height']} />
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
  // A gambrel's steep lower slope gives the headroom: it takes no knee walls.
  const kneeWalls = value.style === 'gable';
  return (
    <Section
      title="Loft"
      enabled={value.loft.enabled}
      onEnable={loft('enabled')} help={DESIGN_HELP['roof.loft.enabled']}
      brief={`${spacing(value.loft.joist, value.loft.oc)}${kneeWalls && value.kneeWalls.enabled ? ', knee walls' : ''}`}
    >
      <SelectField label="Joist" value={value.loft.joist} options={TWO_BY} onChange={loft('joist')} help={DESIGN_HELP['roof.loft.joist']} />
      <SelectField label="Joist o.c. (in)" value={value.loft.oc} options={SPACINGS} onChange={loft('oc')} help={DESIGN_HELP['roof.loft.oc']} />
      <SelectField
        label="Joist support"
        value={value.loft.support}
        options={LOFT_SUPPORTS}
        describe={(support) => LOFT_SUPPORT_LABELS[support]}
        onChange={loft('support')}
        help={DESIGN_HELP['roof.loft.support']}
      />
      <SelectField label="Deck" value={value.loft.deck} options={SHEET_KEYS} describe={sheetLabel} onChange={loft('deck')} help={DESIGN_HELP['roof.loft.deck']} />
      <SelectField
        label="Open end"
        value={value.loft.open.end}
        options={LOFT_OPEN_ENDS}
        describe={(end) => (end === 'none' ? 'None' : capitalize(names.side(end)))}
        onChange={open('end')}
        help={DESIGN_HELP['roof.loft.open.end']}
      />
      {value.loft.open.end !== 'none' && <LengthField label="Open length" value={value.loft.open.length} onChange={open('length')} help={DESIGN_HELP['roof.loft.open.length']} />}
      {kneeWalls && (
        <Group
          title="Knee walls"
          enabled={value.kneeWalls.enabled}
          onEnable={knee('enabled')} help={DESIGN_HELP['roof.kneeWalls.enabled']}
          brief={`${formatLength(value.kneeWalls.height)}, ${value.kneeWalls.stud}`}
        >
          <LengthField label="Height" value={value.kneeWalls.height} onChange={knee('height')} help={DESIGN_HELP['roof.kneeWalls.height']} />
          <SelectField label="Stud" value={value.kneeWalls.stud} options={WALL_STUDS} onChange={knee('stud')} help={DESIGN_HELP['roof.kneeWalls.stud']} />
        </Group>
      )}
      <Group title="Hatches" brief={count(value.loft.hatches.length, 'hatch', 'hatches')}>
        <HatchesEditor value={value.loft.hatches} onChange={loft('hatches')} names={names} />
      </Group>
    </Section>
  );
}

// The look in 3D: the Finished view shows it.
function FinishesSection({ value, onChange }: SectionProps<ShedConfig>) {
  const set = setter(value.finishes, setter(value, onChange)('finishes'));
  const { finishes } = value;
  const metal = value.roof.roofing !== 'shingles' || value.additions.some(({ roofing }) => roofing === 'metal');
  return (
    <Section title="Finishes" brief={`${SIDING_LABELS[finishes.siding]}, ${value.roof.roofing === 'shingles' ? 'shingles' : 'metal roof'}`}>
      <p className="muted hint">For the look in 3D only: the Finished view shows them. They do not change the framing, cut list, or BOM.</p>
      <SelectField label="Siding" value={finishes.siding} options={SIDINGS} describe={(siding) => SIDING_LABELS[siding]} onChange={set('siding')} help={DESIGN_HELP['finishes.siding']} />
      {finishes.siding !== 'none' && <ColorField label="Siding color" value={finishes.sidingColor} onChange={set('sidingColor')} help={DESIGN_HELP['finishes.sidingColor']} />}
      <ColorField label="Trim color" value={finishes.trimColor} onChange={set('trimColor')} help={DESIGN_HELP['finishes.trimColor']} />
      <ColorField label="Roof color" value={finishes.roofColor} onChange={set('roofColor')} help={DESIGN_HELP['finishes.roofColor']} />
      <ColorField label="Door color" value={finishes.doorColor} onChange={set('doorColor')} help={DESIGN_HELP['finishes.doorColor']} />
      {metal && (
        <>
          <LengthField label="Longest metal panel" value={finishes.panelLength} onChange={set('panelLength')} help={DESIGN_HELP['finishes.panelLength']} />
          <LengthField label="Metal past the eaves" value={finishes.metalOverhang} onChange={set('metalOverhang')} help={DESIGN_HELP['finishes.metalOverhang']} />
        </>
      )}
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
        help={DESIGN_HELP['catalog.species']}
      />
      <SelectField
        label="Roof load"
        value={value.loads.roof}
        options={ROOF_LOADS}
        describe={(load) => (load === 20 ? '20 psf roof live, no snow' : `${load} psf roof snow`)}
        onChange={loads('roof')}
        help={DESIGN_HELP['loads.roof']}
      />
      <p className="muted hint">Use the design roof snow load from your building department, not the ground snow load.</p>
      <SelectField
        label="Roof dead load"
        value={value.loads.roofDead}
        options={ROOF_DEAD_LOADS}
        describe={(load) => ROOF_DEAD_LABELS[load]}
        onChange={loads('roofDead')}
        help={DESIGN_HELP['loads.roofDead']}
      />
      {value.roof.loft.enabled && (
        <SelectField
          label="Loft use"
          value={value.loads.loft}
          options={LOFT_USES}
          describe={(use) => LOFT_USE_LABELS[use]}
          onChange={loads('loft')}
          help={DESIGN_HELP['loads.loft']}
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
  const prices = setter(value.prices, set('prices'));
  const { lumber, sheets, concrete, hardware, roofing } = value.prices;
  return (
    <Section title="Lumber catalog" brief={`Stock to ${formatLength(value.maxLength)}`}>
      <LengthField label="Saw kerf" value={value.kerf} onChange={set('kerf')} help={DESIGN_HELP['catalog.kerf']} />
      <LengthField label="Longest stock" value={value.maxLength} onChange={set('maxLength')} help={DESIGN_HELP['catalog.maxLength']} />
      <p className="muted hint">
        Plates, rims, ridges, fascia, and girders splice at this length. Other pieces come from boards no longer than this.
      </p>
      <LengthField label="Longest one-piece stock" value={value.maxOnePiece} onChange={set('maxOnePiece')} help={DESIGN_HELP['catalog.maxOnePiece']} />
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
          help={DESIGN_HELP['catalog.stock']}
        />
      ))}
      <p className="muted hint">
        Prices are US dollars, before tax and delivery. The defaults are US home-center prices from November 2026. Check them
        against a local yard.
      </p>
      <PriceGroup title="Lumber prices" brief={`2x4 ${formatMoney(lumber['2x4'])}/ft`} labels={LUMBER_PRICE_LABELS} value={lumber} onChange={prices('lumber')} help={DESIGN_HELP['catalog.prices.lumber']}>
        <NumberField label="Treated markup (%)" value={value.prices.treatedMarkup} onChange={prices('treatedMarkup')} help={DESIGN_HELP['catalog.prices.treatedMarkup']} />
      </PriceGroup>
      <PriceGroup
        title="Sheet prices"
        brief={`OSB ${formatMoney(sheets['osb-7/16'])}`}
        labels={SHEET_PRICE_LABELS}
        value={sheets}
        onChange={prices('sheets')}
        help={DESIGN_HELP['catalog.prices.sheets']}
      />
      <PriceGroup
        title="Concrete prices"
        brief={`${formatMoney(concrete.bag)} a bag`}
        labels={CONCRETE_PRICE_LABELS}
        value={concrete}
        onChange={prices('concrete')}
        help={DESIGN_HELP['catalog.prices.concrete']}
      />
      <PriceGroup
        title="Hardware prices"
        brief={`Hurricane tie ${formatMoney(hardware.hurricaneTie)}`}
        labels={HARDWARE_PRICE_LABELS}
        value={hardware}
        onChange={prices('hardware')}
        help={DESIGN_HELP['catalog.prices.hardware']}
      />
      <PriceGroup
        title="Roofing prices"
        brief={`Shingles ${formatMoney(roofing.shingles)}/sq ft`}
        labels={ROOFING_PRICE_LABELS}
        value={roofing}
        onChange={prices('roofing')}
        help={DESIGN_HELP['catalog.prices.roofing']}
      />
    </Section>
  );
}

interface PriceGroupProps<K extends string> extends SectionProps<Record<K, number>> {
  title: string;
  brief: string;
  labels: Record<K, string>;
  help: Help;
  children?: ReactNode;
}

function PriceGroup<K extends string>({ title, brief, labels, value, onChange, help, children }: PriceGroupProps<K>) {
  const set = setter(value, onChange);
  return (
    <Group title={title} brief={brief}>
      {(Object.keys(labels) as K[]).map((key) => (
        <PriceField key={key} label={labels[key]} value={value[key]} onChange={set(key)} help={help} />
      ))}
      {children}
    </Group>
  );
}

type Hatch = Roof['loft']['hatches'][number];

function HatchesEditor({ value, onChange, names }: SectionProps<Hatch[]> & { names: Naming }) {
  const [added, setAdded] = useState<number | null>(null);
  const update =
    (index: number): Edit<Hatch> =>
    (next) =>
      onChange(value.map((hatch, at) => (at === index ? next : hatch)));
  return (
    <>
      {value.map((hatch, index) => {
        const set = setter(hatch, update(index));
        return (
          <Card
            key={index}
            title={`Hatch ${index + 1}`}
            brief={`${formatInches(hatch.width)} × ${formatInches(hatch.depth)}`}
            open={index === added}
            actions={
              <button
                className="remove"
                aria-label={`Remove hatch ${index + 1}`}
                onClick={() => onChange(value.filter((_, at) => at !== index))}
              >
                ×
              </button>
            }
          >
            <LengthField label={`From ${names.side('left')} end`} value={hatch.x} onChange={set('x')} help={DESIGN_HELP['roof.loft.hatches.x']} />
            <LengthField label={`From ${names.side('front')} wall`} value={hatch.y} onChange={set('y')} help={DESIGN_HELP['roof.loft.hatches.y']} />
            <LengthField label="Along the ridge" value={hatch.width} onChange={set('width')} help={DESIGN_HELP['roof.loft.hatches.width']} />
            <LengthField label="Across the ridge" value={hatch.depth} onChange={set('depth')} help={DESIGN_HELP['roof.loft.hatches.depth']} />
          </Card>
        );
      })}
      <div className="add-row">
        <button
          onClick={() => {
            onChange([...value, { x: 24, y: 24, width: 24, depth: 30 }]);
            setAdded(value.length);
          }}
        >
          + Hatch
        </button>
      </div>
    </>
  );
}
