import type { Help } from '../fields';

/** The help for each setting in `DesignForm`, keyed by its config path. */
export const DESIGN_HELP = {
  name: {
    about: 'The design name. It shows in the header, on each printed sheet, and in file names.',
  },
  front: {
    about: 'The side you call the front. It changes only names, the plan view, and the 3D camera, not the framing.',
    options: {
      eave: 'The front is an eave wall, a wall that the rafters bear on.',
      gable: 'The front is an end wall, the wall under the peak.',
    },
  },
  width: {
    about: 'Eave wall to eave wall, outside of framing. The rafters and floor joists span this way.',
  },
  length: {
    about: 'End wall to end wall, outside of framing. The ridge, skids, and girders run this way.',
  },
  studHeight: {
    about: 'The wall height, set by the stud. With a precut stud, a cap plate or mud sill each add 1-1/2 in.',
    options: {
      custom: 'Type the height to the top of the plates in the next field.',
    },
  },
  wallHeight: {
    about: 'From the floor surface to the top of the plates.',
  },

  'foundation.type': {
    about: 'What the shed stands on.',
    options: {
      skid: 'Timbers on edge on the ground, under the floor framing. Their ends are cut like a sled runner, so you can drag the shed.',
      pier: 'Concrete piers carry girders, with an optional post on each pier. The floor framing sits on the girders.',
      slab: 'A concrete slab is the floor. The walls stand on pressure-treated plates, bolted to the slab.',
    },
  },
  'foundation.skid.size': {
    about: 'The skid size. Skids stand on edge and are always pressure-treated.',
  },
  'foundation.skid.count': {
    about: 'The number of skids. The outer skids are flush with the floor edges, and the rest are evenly spaced.',
  },
  'foundation.pier.diameter': {
    about: 'The diameter of each concrete pier.',
  },
  'foundation.pier.depth': {
    about: 'How deep each pier goes below grade. Ask your building department for the local frost depth.',
  },
  'foundation.pier.aboveGrade': {
    about: 'How far each pier top stands above grade.',
  },
  'foundation.pier.post': {
    about: 'An optional pressure-treated post on each pier, under the girder.',
  },
  'foundation.pier.postLength': {
    about: 'From the pier top to the girder bottom. A longer post raises the shed.',
  },
  'foundation.pier.girder': {
    about: 'The size of each girder ply. Girders sit on the piers or posts and carry the floor joists.',
  },
  'foundation.pier.girderPlies': {
    about: 'The number of boards side by side in each girder. More plies span farther.',
  },
  'foundation.pier.girderCount': {
    about: 'The number of girder lines along the shed. The outer lines are flush with the floor edges.',
  },
  'foundation.pier.maxSpacing': {
    about: 'The largest distance between piers along a girder, center to center.',
  },
  'foundation.slab.thickness': {
    about: 'The thickness of the concrete slab.',
  },
  'foundation.slab.thickenedEdge': {
    about: 'A deeper band of concrete around the slab edge, under the walls.',
  },
  'foundation.slab.edgeWidth': {
    about: 'How far the thickened edge reaches in from the slab edge.',
  },
  'foundation.slab.edgeDepth': {
    about: 'From the slab top to the bottom of the thickened edge. It must be more than the slab thickness.',
  },
  'foundation.slab.anchorSpacing': {
    about: 'The largest distance between anchor bolts along the wall plates.',
  },
  'foundation.slab.anchorEndDistance': {
    about: 'From each plate end, and each side of a doorway, to the nearest anchor bolt.',
  },

  'floor.joist': {
    about: 'The floor joist size. The rim joists and blocking use it too.',
  },
  'floor.oc': {
    about: 'Floor joist spacing, center to center (o.c.).',
  },
  'floor.treated': {
    about: 'On: the floor framing is pressure-treated (PT). Skids, girders, and posts are always PT.',
  },
  'floor.blocking': {
    about: 'One row of blocks between the floor joists, at half their length. With an odd number of skids or girders, the row sits over the middle one and holds the joists upright there.',
  },
  'floor.subfloor': {
    about: 'The sheets on the floor joists.',
  },

  'walls.stud': {
    about: 'The stud size. It sets the wall depth, and the plates use it too.',
  },
  'walls.oc': {
    about: 'Stud spacing, center to center (o.c.).',
  },
  'walls.mudSill': {
    about: 'On a slab, a separate pressure-treated plate under the bottom plate. On precut studs, it adds 1-1/2 in to the wall height.',
    options: {
      match: 'A mud sill the size of the wall stud.',
    },
  },
  'walls.capPlate': {
    about: 'A second top plate. It laps the corners to tie the walls together. On precut studs, it adds 1-1/2 in to the wall height.',
  },
  'walls.corner': {
    about: 'How each corner is framed. One wall runs through to the corner; the other butts into it.',
    options: {
      'four-stud': 'A solid corner post of three studs, plus the end stud of the butted wall.',
      'three-stud': 'An end stud, and a backing stud that gives the inside finish a nail edge.',
      california: 'An end stud, and a stud laid flat on the inside edge of the through wall.',
      'two-stud': 'The end stud only. The inside finish needs drywall clips.',
    },
  },
  'walls.through': {
    about: 'Which pair of walls runs to the building corners. The other pair fits between them.',
    options: {
      ends: 'The end walls run through. Each gable end is one full-width frame.',
      eaves: 'The eave walls run through. The end walls fit between them.',
    },
  },
  'walls.sheathing': {
    about: 'The sheets on the outside of the walls and gable ends.',
  },
  'walls.header': {
    about: 'The header size for each opening type that does not set its own. A header is the beam over an opening.',
  },
  'walls.doubleJackOver': {
    about: 'Openings wider than this get 2 jack studs on each side, else 1. It applies to opening types with jacks on auto.',
  },
  'walls.sillPlies': {
    about: 'The number of flat boards under each opening that starts above the floor.',
  },

  'roof.style': {
    about: 'The shape of the main roof.',
    options: {
      gable: 'Two slopes that meet at a ridge. It can have ties, a loft, and knee walls.',
      gambrel: 'A barn roof: a steep lower slope, then a shallower upper slope on each side. It can have ties and a loft, but no knee walls.',
      'lean-to': 'One slope, from a high eave wall down to a low one. It has no ridge, ties, or loft.',
    },
  },
  'roof.highSide': {
    about: 'The eave wall at the top of the slope. It is taller than the other eave wall.',
  },
  'roof.gambrel.lowerPitch': {
    about: 'The steep lower slope, in inches of rise per 12 in of run. It must be steeper than the upper pitch.',
  },
  'roof.pitch': {
    about: 'Inches of rise per 12 in of run. On a gambrel, this is the upper slope.',
  },
  'roof.gambrel.breakRun': {
    about: 'How far the break is in from the eave wall, measured level. Type auto for equal lower and upper rafters.',
  },
  'roof.gambrel.ridgeBoard': {
    about: 'On: the upper rafters meet at a ridge board. Off: they butt at the peak, joined by plywood gussets.',
  },
  'roof.rafter': {
    about: 'The rafter size. Fly rafters use it too.',
  },
  'roof.oc': {
    about: 'Rafter spacing, center to center (o.c.).',
  },
  'roof.ridge': {
    about: 'The board at the peak, between the rafter pairs. A ridge shallower than the rafter plumb cut gets a warning.',
  },
  'roof.gablePanel': {
    about: 'On: each gable end is a panel on its own bottom plate, nailed to the end wall. Off: the gable framing stands on the end wall top plate.',
  },
  'roof.eaveOverhang': {
    about: 'How far the rafter tails reach past each eave wall, measured level.',
  },
  'roof.tailCut': {
    about: 'How the rafter ends are cut at the eaves.',
    options: {
      plumb: 'A vertical cut. On a steep roof, the rafter ends show below the fascia.',
      square: 'A cut square to the rafter. The fascia tilts with the roof.',
      'plumb-level': 'A vertical cut as deep as the fascia, then a level cut. The fascia covers the whole rafter end.',
    },
  },
  'roof.fascia': {
    about: 'The board along each eave, on the rafter tails. With no fascia, a plumb-and-level tail cut becomes a plumb cut.',
  },
  'roof.fasciaTop': {
    about: 'How the top of a plumb fascia meets the sloped roof.',
    options: {
      'set-down': 'The fascia sits lower, so the roof passes over its top edge.',
      beveled: 'The fascia top is at the rafter tops, with its top edge ripped to the pitch.',
      flush: 'The fascia top is at the rafter tops, with a square edge. Its outer edge stands above the roof.',
    },
  },
  'roof.rakeOverhang': {
    about: 'How far the roof reaches past each end wall. Under 1-1/2 in counts as none.',
  },
  'roof.rakeLadder.size': {
    about: 'The size of the rake ladder lookouts and rail. A rake ladder frames the overhang at each gable end.',
  },
  'roof.rakeLadder.spacing': {
    about: 'The largest distance between lookouts, the short blocks in the ladder.',
  },
  'roof.rakeLadder.ridgeExtends': {
    about: 'On: the ridge board runs out to the fly rafters. Off: it stops at the end walls.',
  },
  'roof.rakeLadder.fasciaLookouts': {
    about: 'On: a lookout at the fascia end of each ladder. Off: the fascia ties the ladder ends.',
  },
  'roof.rakeLadder.onEndRafter': {
    about: 'On: the gable-end rafter is the ladder rail. Off: the ladder has its own rail, nailed to that rafter.',
  },
  'roof.sheathing': {
    about: 'The sheets on the rafters.',
  },
  'roof.roofing': {
    about: 'What covers the main roof.',
    options: {
      shingles: 'Shingles on the roof sheathing.',
      metal: 'Metal panels on purlins across open rafters, with no sheathing.',
      'metal-over-sheathing': 'Metal panels on purlins laid on the roof sheathing.',
    },
  },
  'roof.purlin': {
    about: 'Purlins are boards laid flat across the rafters to carry metal roofing.',
  },
  'roof.purlinSpacing': {
    about: 'The largest distance between purlins along the slope. Use the spacing the panel maker gives.',
  },
  'roof.rafterTies.enabled': {
    about: 'Level boards low in the roof that keep the rafters from pushing the walls apart. A loft does this job instead.',
  },
  'roof.rafterTies.size': {
    about: 'The rafter tie size.',
  },
  'roof.rafterTies.every': {
    about: 'Which rafter pairs get a tie: 1 is each pair, 2 is every second pair.',
  },
  'roof.rafterTies.height': {
    about: 'From the top of the wall plates up to the ties. Ties above the lower third of the roof get a warning.',
  },
  'roof.collarTies.enabled': {
    about: 'Level boards high in the roof that tie each rafter pair together near the top.',
  },
  'roof.collarTies.size': {
    about: 'The collar tie size.',
  },
  'roof.collarTies.every': {
    about: 'Which rafter pairs get a collar tie: 1 is each pair, 2 is every second pair.',
  },
  'roof.collarTies.height': {
    about: 'From the top of the wall plates up to the ties. Type auto to place them in the upper third of the roof.',
  },

  'roof.loft.enabled': {
    about: 'A floor in the roof space, on joists from eave wall to eave wall.',
  },
  'roof.loft.joist': {
    about: 'The loft joist size.',
  },
  'roof.loft.oc': {
    about: 'Loft joist spacing, center to center (o.c.).',
  },
  'roof.loft.support': {
    about: 'How the loft joists bear on the eave walls.',
    options: {
      plates: 'On the wall plates, with the ends cut to the roof line.',
      hung: 'In joist hangers on ledgers inside the eave walls. The loft floor is lower by the joist depth.',
    },
  },
  'roof.loft.deck': {
    about: 'The sheets on the loft joists.',
  },
  'roof.loft.open.end': {
    about: 'An end of the loft with no floor, if any.',
  },
  'roof.loft.open.length': {
    about: 'How far the open part reaches in from its end wall.',
  },
  'roof.kneeWalls.enabled': {
    about: 'Short walls along both eaves of a loft. They raise the whole roof, so the loft gets more headroom. Gable roofs only.',
  },
  'roof.kneeWalls.height': {
    about: 'The knee wall height, to the top of its plates. The roof rises by this height.',
  },
  'roof.kneeWalls.stud': {
    about: 'The knee wall stud and plate size.',
  },
  'roof.loft.hatches.x': {
    about: 'Along the ridge, from that end wall to the near edge of the hatch.',
  },
  'roof.loft.hatches.y': {
    about: 'Across the ridge, from that eave wall to the near edge of the hatch.',
  },
  'roof.loft.hatches.width': {
    about: 'The hatch size along the ridge.',
  },
  'roof.loft.hatches.depth': {
    about: 'The hatch size across the ridge.',
  },

  'finishes.siding': {
    about: 'The siding look in the 3D Finished view.',
  },
  'finishes.sidingColor': {
    about: 'The siding color in 3D.',
  },
  'finishes.trimColor': {
    about: 'The color of the corner boards, casings, window frames, and door jambs in 3D.',
  },
  'finishes.roofColor': {
    about: 'The roofing color in 3D.',
  },
  'finishes.doorColor': {
    about: 'The door color in 3D.',
  },
  'finishes.panelLength': {
    about: 'The longest metal roofing panel in 3D. Longer slopes get more rows of panels.',
  },
  'finishes.metalOverhang': {
    about: 'How far the metal panels run past the eave in 3D.',
  },

  'catalog.species': {
    about: 'The lumber species, for the span checks only. Use the species stamped on your lumber.',
  },
  'loads.roof': {
    about: 'The live or snow load on the roof, per sq ft. If your snow load falls between two choices, use the higher one.',
    options: {
      '20': 'Roof live load only. Use it where the snow load is under 20 psf.',
    },
  },
  'loads.roofDead': {
    about: 'The weight of the roof itself, per sq ft: 10 for shingles or metal, 15 for heavier roofing, 20 for clay tile.',
  },
  'loads.loft': {
    about: 'The use of the loft floor. It sets the load for the loft span checks.',
    options: {
      storage: '20 psf live load: limited attic storage.',
      sleeping: '30 psf live load: sleeping areas.',
    },
  },

  'catalog.kerf': {
    about: 'The width of wood that one saw cut removes.',
  },
  'catalog.maxLength': {
    about: 'The longest board you want to buy. Longer runs splice over a stud, joist, rafter, or pier.',
  },
  'catalog.maxOnePiece': {
    about: 'A piece longer than the longest stock, but within this limit, gets a special-order warning.',
  },
  'catalog.stock': {
    about: 'The board lengths a yard sells in this size, separated by commas.',
  },
  'catalog.prices.lumber': {
    about: 'The price of untreated lumber in this size, per linear foot.',
  },
  'catalog.prices.treatedMarkup': {
    about: 'The percent that pressure-treated lumber costs over untreated.',
  },
  'catalog.prices.sheets': {
    about: 'The price of one 4 × 8 ft sheet.',
  },
  'catalog.prices.concrete': {
    about: 'The BOM prices a pour under 1 cu yd in 80 lb bags, and a larger pour as ready-mix.',
  },
  'catalog.prices.hardware': {
    about: 'The price of each connector that the BOM counts.',
  },
  'catalog.prices.roofing': {
    about: 'Roofing per sq ft, and drip edge per foot. The BOM adds nothing for waste, ridge cap, or underlayment.',
  },
} as const satisfies Record<string, Help>;
