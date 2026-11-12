import type { Help } from '../fields';

/** The help for each setting in the list editors, keyed by its config path. A `:` suffix tells apart two fields on one path. */
export const EDITOR_HELP = {
  'openingTypes.name': {
    about: 'The type name. Placement rows pick the type by this name. Each name must be unique.',
  },
  'openingTypes.kind': {
    about: 'What goes in the opening. It sets the Size list and the look in 3D. The framing is the same for each kind.',
    options: {
      door: 'Single and double prehung doors.',
      window: 'Standard window sizes.',
      overhead: 'A garage door. It adds the "Headroom needed" field.',
      custom: 'Any other opening, such as a vent. Type the rough opening size.',
    },
  },
  'openingTypes.size': {
    about: "Common sizes of this kind. A choice sets the rough opening from the product size. Check it against the maker's data before you frame.",
    options: {
      custom: 'Type the size in "RO width" and "RO height".',
    },
  },
  'openingTypes.width': {
    about: 'Width of the rough opening (RO): the framed hole, from jack to jack.',
  },
  'openingTypes.height': {
    about: 'Height of the RO, from the sill up to the underside of the header. The opening must fit under the top plate.',
  },
  'openingTypes.girder': {
    about: 'How the header, the beam over the opening, is built.',
    options: {
      single: 'One ply on edge.',
      double: 'Two plies on edge.',
      triple: 'Three plies on edge. In a 2x4 wall they stand 1 in proud.',
      flat: 'One board of the wall stud size, laid flat. An eave wall gets a warning.',
    },
  },
  'openingTypes.header': {
    about: 'The header ply size. The span check on the Warnings tab shows if it carries the opening width.',
    options: {
      default: 'The "Default header" size in Header and jack defaults.',
    },
  },
  'openingTypes.plateBelow': {
    about: 'A flat board under the header, on the jacks. It adds 1-1/2 in to the header stack.',
  },
  'openingTypes.plateAbove': {
    about: 'A flat board on top of the header, under the cripples. It adds 1-1/2 in to the header stack.',
  },
  'openingTypes.jacks': {
    about: 'Jack studs on each side of the RO. They carry the header.',
    options: {
      auto: 'One jack per side, or two when the RO is wider than "2 jacks when RO over".',
    },
  },
  'openingTypes.headroom': {
    about: "The clear height a garage door track needs above the RO. Take it from the door maker's data.",
  },

  'additions.side': {
    about: 'The wall the lean-to stands against. Each side takes one lean-to.',
  },
  'additions.mirror': {
    about: 'Builds a matching lean-to on the opposite side. That side must be free.',
  },
  'additions.attach': {
    about: 'How the lean-to roof meets the main roof.',
    options: {
      soffit: 'The lean-to rafters hang from a ledger on the main wall, under the main eave or rake. It works on any side, at any length.',
      extension: 'The lean-to rafters lap the main rafters and continue the main roof down. It runs the full wall length, on an eave only.',
    },
  },
  'additions.depth': {
    about: 'From the main wall out to the outside face of the posts, measured level.',
  },
  'additions.length:full': {
    about: 'On: the lean-to runs the full wall length. Off: set its length and center.',
  },
  'additions.length': {
    about: 'Length along the wall.',
  },
  'additions.center': {
    about: 'The middle of the lean-to, as a percent of the wall length from the left corner. 50 centers it.',
  },
  'additions.pitch:main': {
    about: "On: the lean-to takes the main roof's pitch. Off: set the pitch.",
  },
  'additions.pitch': {
    about: 'The lean-to roof rise in inches per 12 in of run.',
  },
  'additions.drop': {
    about: 'How far below its highest place the ledger goes. It lowers the whole lean-to roof.',
  },
  'additions.rafter': {
    about: 'The lean-to rafter size.',
  },
  'additions.oc': {
    about: 'Lean-to rafter spacing, center to center.',
  },
  'additions.eaveOverhang': {
    about: 'How far the rafter tails run past the posts, measured level.',
  },
  'additions.fascia': {
    about: 'A board on the rafter tails along the lean-to eave.',
  },
  'additions.roofing': {
    about: 'What covers the lean-to rafters.',
    options: {
      sheathing: "The main roof's sheathing, with shingles.",
      metal: 'Metal panels on purlins, with no sheathing.',
    },
  },
  'additions.purlin': {
    about: 'The purlin size: boards laid flat across the rafters to carry the metal panels.',
  },
  'additions.purlinSpacing': {
    about: 'The largest distance between purlins along the slope.',
  },
  'additions.post': {
    about: 'The size of the PT posts that carry the beam.',
  },
  'additions.maxSpacing': {
    about: 'The largest distance between posts, center to center.',
  },
  'additions.beam': {
    about: 'The size of the beam on the posts. The rafters sit on it.',
  },
  'additions.beamPlies': {
    about: 'The number of boards side by side in the beam.',
  },
  'additions.floor': {
    about: 'What is under the lean-to, and what its posts stand on.',
    options: {
      none: 'No floor. Each post stands on a concrete pier.',
      slab: 'A concrete slab at grade. The posts stand on it.',
      deck: 'A PT wood deck. The posts stand on the deck beam.',
    },
  },
  'additions.deck.joist': {
    about: 'The deck joist size. The deck ledger and beam use it too.',
  },
  'additions.deck.oc': {
    about: 'Deck joist spacing, center to center. Too wide a spacing for the deck boards gets a warning.',
  },
  'additions.deck.boards': {
    about: 'The deck surface boards.',
    options: {
      '5/4x6': 'Spans up to 16 in between joists.',
      '2x6': 'Spans up to 24 in between joists.',
    },
  },
  'additions.deck.support': {
    about: 'What carries the deck.',
    options: {
      piers: "A ledger on the shed's floor framing, and a beam on concrete piers.",
      shed: "Skids or girders like the shed's, at the shed's own height.",
    },
  },
  'additions.deck.join': {
    about: "How the deck's skids or girders meet the shed's on a gable end.",
    options: {
      continue: "The shed's skids or girders run on out under the deck. With skids, shed and deck make one sled.",
      separate: 'The deck gets its own skids or girders, in line with the shed. The deck can come off.',
    },
  },
  'additions.deck.drop': {
    about: 'From the shed floor down to the deck surface. At 0 the deck is flush with the floor.',
  },

  'ramps.opening': {
    about: 'An opening for the ramp to follow. The ramp centers on it and moves with it.',
    options: {
      free: 'The ramp has its own place: set the wall, position, and width below.',
      gone: 'The opening the ramp followed is gone. Pick another, or "No opening: placed below".',
    },
  },
  'ramps.margin': {
    about: 'How far the ramp runs past each side of the opening it follows.',
  },
  'ramps.wall': {
    about: 'The wall the ramp runs out from.',
  },
  'ramps.along': {
    about: 'What the position measures from.',
  },
  'ramps.at:percent': {
    about: 'The ramp center, as a percent of the wall length from the left corner.',
  },
  'ramps.at:corner': {
    about: "From the wall's corner to the ramp's near edge.",
  },
  'ramps.width': {
    about: 'Width of the ramp along the wall.',
  },
  'ramps.slope': {
    about: 'Run for each unit of rise: at 12, the ramp runs out 12 in for each 1 in of drop. A larger number is gentler.',
  },
  'ramps.belowGrade': {
    about: "How far the ramp's foot is below grade, for lower ground such as a drive.",
  },
  'ramps.material': {
    about: 'What the ramp is made of.',
    options: {
      wood: 'PT 2x6 boards across PT stringers.',
      concrete: 'A concrete wedge from the foundation edge down to the foot.',
    },
  },
  'ramps.thickness': {
    about: "The concrete under the ramp's foot.",
  },
  'ramps.stringer': {
    about: 'The stringer size: the sloped PT boards that carry the ramp boards.',
  },
  'ramps.oc': {
    about: 'Stringer spacing, center to center.',
  },
} as const satisfies Record<string, Help>;
