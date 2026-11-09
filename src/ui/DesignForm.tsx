import { LUMBER_SIZES, SHEETS, SHEET_KEYS, TWO_BY, stockLengths } from '../core/catalog';
import {
  CORNERS,
  FASCIA,
  FOUNDATION_TYPES,
  LOFT_SUPPORTS,
  MUD_SILLS,
  PIER_DIAMETERS,
  POST_SIZES,
  ROOF_STYLES,
  SHEATHING,
  SKID_SIZES,
  SPACINGS,
  TAIL_CUTS,
  WALL_STUDS,
  type ShedConfig,
} from '../core/config';
import {
  AutoLengthField,
  CheckField,
  LengthField,
  LengthListField,
  NumberField,
  Section,
  SelectField,
  Subhead,
  TextField,
  capitalize,
  setter,
  type SectionProps,
} from './fields';
import { studLengths } from '../core/gen/walls';
import { formatInches } from '../core/units';
import { OpeningRowsEditor, OpeningTypesEditor } from './OpeningsEditor';

type Foundation = ShedConfig['foundation'];
type Floor = ShedConfig['floor'];
type Walls = ShedConfig['walls'];
type Roof = ShedConfig['roof'];
type Catalog = ShedConfig['catalog'];

const MUD_SILL_LABELS: Record<string, string> = { none: 'None: PT bottom plate', match: 'Same as wall stud' };
const LOFT_SUPPORT_LABELS = { plates: 'On the wall plates', hung: 'Hung from ledgers' };

const CORNER_LABELS = {
  'four-stud': '4-stud post',
  'three-stud': '3-stud',
  california: 'California',
  'two-stud': '2-stud + clips',
};

const sheetLabel = (key: (typeof SHEATHING)[number]) => (key === 'none' ? 'None' : SHEETS[key].label);
const noneLabel = (option: string) => (option === 'none' ? 'None' : option);

export function DesignForm({ value, onChange }: SectionProps<ShedConfig>) {
  const set = setter(value, onChange);
  return (
    <>
      <Section title="Shed" open>
        <TextField label="Name" value={value.name} onChange={set('name')} />
        <LengthField label="Width (front to back)" value={value.width} onChange={set('width')} />
        <LengthField label="Length (left to right)" value={value.length} onChange={set('length')} />
        <LengthField label="Wall height" value={value.wallHeight} onChange={set('wallHeight')} />
        <p className="muted hint">
          Floor to the top of the top plates. Studs: {formatInches(studLengths(value).left)}.
        </p>
      </Section>
      <FoundationSection value={value.foundation} onChange={set('foundation')} />
      {value.foundation.type !== 'slab' && <FloorSection value={value.floor} onChange={set('floor')} />}
      <WallsSection value={value.walls} onChange={set('walls')} onSlab={value.foundation.type === 'slab'} />
      <Section title="Opening types">
        <OpeningTypesEditor value={value} onChange={onChange} />
      </Section>
      <Section title="Openings">
        <OpeningRowsEditor value={value} onChange={onChange} />
      </Section>
      <RoofSection value={value.roof} onChange={set('roof')} />
      <CatalogSection value={value.catalog} onChange={set('catalog')} />
    </>
  );
}

function FoundationSection({ value, onChange }: SectionProps<Foundation>) {
  const set = setter(value, onChange);
  const skid = setter(value.skid, set('skid'));
  const pier = setter(value.pier, set('pier'));
  const slab = setter(value.slab, set('slab'));
  return (
    <Section title="Foundation">
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
      <LengthField label="Gravel depth" value={value.gravelDepth} onChange={set('gravelDepth')} />
      <LengthField label="Gravel margin" value={value.gravelMargin} onChange={set('gravelMargin')} />
    </Section>
  );
}

function FloorSection({ value, onChange }: SectionProps<Floor>) {
  const set = setter(value, onChange);
  return (
    <Section title="Floor">
      <SelectField label="Joist" value={value.joist} options={TWO_BY} onChange={set('joist')} />
      <SelectField label="Joist o.c. (in)" value={value.oc} options={SPACINGS} onChange={set('oc')} />
      <CheckField label="Pressure treated" value={value.treated} onChange={set('treated')} />
      <CheckField label="Mid-span blocking" value={value.blocking} onChange={set('blocking')} />
      <SelectField label="Subfloor" value={value.subfloor} options={SHEET_KEYS} describe={sheetLabel} onChange={set('subfloor')} />
    </Section>
  );
}

function WallsSection({ value, onChange, onSlab }: SectionProps<Walls> & { onSlab: boolean }) {
  const set = setter(value, onChange);
  return (
    <Section title="Walls">
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
      <SelectField label="Default header" value={value.header} options={TWO_BY} onChange={set('header')} />
      <LengthField label="2 jacks when RO over" value={value.doubleJackOver} onChange={set('doubleJackOver')} />
      <SelectField label="Rough sill plies" value={value.sillPlies} options={[1, 2]} onChange={set('sillPlies')} />
      <SelectField label="Sheathing" value={value.sheathing} options={SHEATHING} describe={sheetLabel} onChange={set('sheathing')} />
    </Section>
  );
}

function RoofSection({ value, onChange }: SectionProps<Roof>) {
  const set = setter(value, onChange);
  const ladder = setter(value.rakeLadder, set('rakeLadder'));
  const ties = setter(value.rafterTies, set('rafterTies'));
  const collar = setter(value.collarTies, set('collarTies'));
  const loft = setter(value.loft, set('loft'));
  const knee = setter(value.kneeWalls, set('kneeWalls'));
  return (
    <Section title="Roof">
      <SelectField label="Style" value={value.style} options={ROOF_STYLES} describe={capitalize} onChange={set('style')} />
      <NumberField label="Pitch (in / 12)" value={value.pitch} onChange={set('pitch')} />
      <SelectField label="Rafter" value={value.rafter} options={TWO_BY} onChange={set('rafter')} />
      <SelectField label="Rafter o.c. (in)" value={value.oc} options={SPACINGS} onChange={set('oc')} />
      <LengthField label="Eave overhang" value={value.eaveOverhang} onChange={set('eaveOverhang')} />
      <LengthField label="Rake overhang" value={value.rakeOverhang} onChange={set('rakeOverhang')} />
      <SelectField label="Tail cut" value={value.tailCut} options={TAIL_CUTS} describe={capitalize} onChange={set('tailCut')} />
      <SelectField label="Fascia" value={value.fascia} options={FASCIA} describe={noneLabel} onChange={set('fascia')} />
      <SelectField label="Sheathing" value={value.sheathing} options={SHEATHING} describe={sheetLabel} onChange={set('sheathing')} />
      <SelectField label="Rake ladder" value={value.rakeLadder.size} options={TWO_BY} onChange={ladder('size')} />
      <SelectField label="Lookout o.c. (in)" value={value.rakeLadder.spacing} options={SPACINGS} onChange={ladder('spacing')} />

      {value.style === 'lean-to' && (
        <SelectField label="High side" value={value.highSide} options={['front', 'back'] as const} describe={capitalize} onChange={set('highSide')} />
      )}

      {value.style === 'gable' && (
        <>
          <SelectField label="Ridge board" value={value.ridge} options={TWO_BY} onChange={set('ridge')} />

          <Subhead>Loft</Subhead>
          <CheckField label="Loft deck" value={value.loft.enabled} onChange={loft('enabled')} />
          {value.loft.enabled && (
            <>
              <SelectField label="Loft joist" value={value.loft.joist} options={TWO_BY} onChange={loft('joist')} />
              <SelectField label="Loft joist o.c. (in)" value={value.loft.oc} options={SPACINGS} onChange={loft('oc')} />
              <SelectField
                label="Joist support"
                value={value.loft.support}
                options={LOFT_SUPPORTS}
                describe={(support) => LOFT_SUPPORT_LABELS[support]}
                onChange={loft('support')}
              />
              <SelectField label="Deck" value={value.loft.deck} options={SHEET_KEYS} describe={sheetLabel} onChange={loft('deck')} />
              <CheckField label="Knee walls" value={value.kneeWalls.enabled} onChange={knee('enabled')} />
              {value.kneeWalls.enabled && (
                <>
                  <LengthField label="Knee wall height" value={value.kneeWalls.height} onChange={knee('height')} />
                  <SelectField label="Knee wall stud" value={value.kneeWalls.stud} options={WALL_STUDS} onChange={knee('stud')} />
                </>
              )}
            </>
          )}

          {!value.loft.enabled && (
            <>
              <Subhead>Rafter ties</Subhead>
              <CheckField label="Rafter ties" value={value.rafterTies.enabled} onChange={ties('enabled')} />
              {value.rafterTies.enabled && (
                <>
                  <SelectField label="Size" value={value.rafterTies.size} options={TWO_BY} onChange={ties('size')} />
                  <NumberField label="Every Nth pair" value={value.rafterTies.every} onChange={ties('every')} />
                  <LengthField label="Height above plate" value={value.rafterTies.height} onChange={ties('height')} />
                </>
              )}
            </>
          )}

          <Subhead>Collar ties</Subhead>
          <CheckField label="Collar ties" value={value.collarTies.enabled} onChange={collar('enabled')} />
          {value.collarTies.enabled && (
            <>
              <SelectField label="Size" value={value.collarTies.size} options={TWO_BY} onChange={collar('size')} />
              <NumberField label="Every Nth pair" value={value.collarTies.every} onChange={collar('every')} />
              <AutoLengthField label="Height above plate" value={value.collarTies.height} onChange={collar('height')} />
            </>
          )}
        </>
      )}
    </Section>
  );
}

function CatalogSection({ value, onChange }: SectionProps<Catalog>) {
  const set = setter(value, onChange);
  return (
    <Section title="Lumber catalog">
      <LengthField label="Saw kerf" value={value.kerf} onChange={set('kerf')} />
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
