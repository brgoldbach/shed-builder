import * as catalog from '../src/core/catalog';
import * as config from '../src/core/config';
import { shedSchema, type ShedConfig } from '../src/core/config';
import { DESIGNS } from './designs';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Path = (string | number)[];
type Random = () => number;

// mulberry32: a small seeded generator, so each failure repeats from its seed.
function generator(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL = DESIGNS.map((design) => JSON.parse(JSON.stringify(design)) as Json);

// A setting, picked one level at a time, so a large group such as the prices is no likelier than
// the width. It can stop at a group or list, to change it whole.
function choosePath(value: Json, random: Random, path: Path = []): Path {
  if (value === null || typeof value !== 'object') return path;
  const keys = Array.isArray(value) ? value.map((_, index) => index) : Object.keys(value).filter((key) => key !== 'schemaVersion');
  if (keys.length === 0 || (path.length > 0 && random() < 0.15)) return path;
  const key = keys[Math.floor(random() * keys.length)];
  return choosePath((value as Record<string | number, Json>)[key], random, [...path, key]);
}

const strings = (value: Json): string[] =>
  typeof value === 'string' ? [value] : value !== null && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

// Every word an enum setting can take: the option lists the app exports, and the words in the designs.
const WORDS = [
  ...new Set([...Object.values(config), ...Object.values(catalog)].filter(Array.isArray).flat().filter((word) => typeof word === 'string')),
  ...new Set(POOL.flatMap(strings)),
];

function at(value: Json, path: Path): Json | undefined {
  let node: Json | undefined = value;
  for (const key of path) node = node !== null && typeof node === 'object' ? (node as Record<string | number, Json>)[key] : undefined;
  return node;
}

function setAt(value: Json, path: Path, next: Json | undefined): Json {
  if (path.length === 0) return next ?? null;
  const copy = (Array.isArray(value) ? [...value] : { ...(value as object) }) as Record<string | number, Json>;
  const [key, ...rest] = path;
  if (next === undefined && rest.length === 0) {
    if (Array.isArray(copy)) copy.splice(key as number, 1);
    else delete copy[key];
  } else copy[key] = setAt(copy[key], rest, next);
  return copy as Json;
}

// One change to one setting: a new value of its kind, another design's value at the same path, or
// one item more or less in a list.
function mutate(design: Json, random: Random): Json {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const path = choosePath(design, random);
  const value = at(design, path);
  const other = at(pick(POOL), path);
  if (other !== undefined && random() < 0.25) return setAt(design, path, other);
  if (Array.isArray(value)) {
    if (value.length > 0 && random() < 0.5) return setAt(design, [...path, Math.floor(random() * value.length)], undefined);
    return value.length > 0 ? setAt(design, path, [...value, pick(value)]) : design;
  }
  if (typeof value === 'boolean') return setAt(design, path, !value);
  if (typeof value === 'number') {
    const scaled = pick([0.5, 0.75, 1.25, 1.5, 2, 3]) * value;
    return setAt(design, path, pick([value + 1, value - 1, Math.round(scaled), scaled, 0, 'auto']));
  }
  if (value === 'auto') return setAt(design, path, pick([12, 24, 48, 96]));
  if (typeof value === 'string') return setAt(design, path, pick(WORDS));
  return design;
}

/** `count` designs, each a test design with 1 to 6 settings changed. The same seed gives the same designs. */
export function randomDesigns(count: number, seed: number): ShedConfig[] {
  const random = generator(seed);
  return Array.from({ length: count }, () => {
    let design = POOL[Math.floor(random() * POOL.length)];
    const changes = 1 + Math.floor(random() * 6);
    for (let made = 0, tries = 0; made < changes && tries < 100; tries++) {
      const result = shedSchema.safeParse(mutate(design, random));
      if (result.success) {
        design = JSON.parse(JSON.stringify(result.data)) as Json;
        made++;
      }
    }
    return shedSchema.parse(design);
  });
}
