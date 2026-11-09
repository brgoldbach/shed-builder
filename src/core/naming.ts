import type { ShedConfig } from './config';
import { ASSEMBLIES, type Assembly } from './member';

type Side = 'front' | 'back' | 'left' | 'right';

// With a gable end in front, the user stands a quarter turn from the model: its left gable end is
// their front, and its front eave wall is on their right.
const GABLE_FRONT: Record<Side, Side> = { left: 'front', right: 'back', front: 'right', back: 'left' };
const SIDE_ORDER: Side[] = ['front', 'back', 'left', 'right'];
const KIND_ORDER = ['wall', 'gable', 'roof', 'loft', 'knee'];
const KIND_WORDS: Record<string, (side: string) => { label: string; prefix: string }> = {
  wall: (side) => ({ label: `${side} wall`, prefix: `${side[0].toUpperCase()}W` }),
  gable: (side) => ({ label: `${side} gable end`, prefix: `G${side[0].toUpperCase()}` }),
  knee: (side) => ({ label: `${side} knee wall`, prefix: `K${side[0].toUpperCase()}` }),
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The user's names for the model's sides and assemblies. */
export interface Naming {
  side: (side: Side) => Side;
  /** The model's sides in the user's order: their front, back, left, right. */
  sides: readonly Side[];
  assembly: (assembly: Assembly) => { label: string; prefix: string };
  /** Sort key: walls, gable ends, roof, loft, knee walls; front, back, left, right within each. */
  rank: (assembly: Assembly) => number;
}

export function naming(config: Pick<ShedConfig, 'front'>): Naming {
  const side = (model: Side) => (config.front === 'gable' ? GABLE_FRONT[model] : model);
  const split = (assembly: Assembly) => assembly.split('.') as [string, Side | undefined];
  return {
    side,
    sides: [...SIDE_ORDER].sort((first, second) => SIDE_ORDER.indexOf(side(first)) - SIDE_ORDER.indexOf(side(second))),
    assembly: (assembly) => {
      const [kind, model] = split(assembly);
      if (!model) {
        const { label, prefix } = ASSEMBLIES[assembly];
        return { label, prefix };
      }
      const { label, prefix } = KIND_WORDS[kind](side(model));
      return { label: capitalize(label), prefix };
    },
    rank: (assembly) => {
      const [kind, model] = split(assembly);
      return KIND_ORDER.indexOf(kind) * 10 + (model ? SIDE_ORDER.indexOf(side(model)) : 0);
    },
  };
}
