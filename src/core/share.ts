import { APP_VERSION, parseConfigText, serializeConfig, shedSchema, type ParseResult, type ShedConfig } from './config';
import { pruneConfig } from './prune';

/** The address fragment that carries a design: `#design=<data>`. */
export const LINK_KEY = 'design=';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const isObject = (value: Json | undefined): value is { [key: string]: Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const same = (first: Json | undefined, second: Json | undefined) => JSON.stringify(first) === JSON.stringify(second);

type JsonObject = { [key: string]: Json };
const DEFAULTS = JSON.parse(serializeConfig(shedSchema.parse({ schemaVersion: 1 }))) as Json;

// A list item's defaults, from one parsed with only the keys a file must give, which it keeps.
const SAMPLE = shedSchema.parse({
  schemaVersion: 1,
  openingTypes: [{ name: 'item', kind: 'door', width: 36, height: 80 }],
  openings: [{ type: 'item', wall: 'front', at: [50] }],
  additions: [{ side: 'front' }],
});
const ITEMS: Record<string, { item: JsonObject; keep: string[] }> = {
  openingTypes: { item: SAMPLE.openingTypes[0] as unknown as JsonObject, keep: ['name', 'kind', 'width', 'height'] },
  openings: { item: SAMPLE.openings[0] as unknown as JsonObject, keep: ['type', 'wall', 'at'] },
  additions: { item: SAMPLE.additions[0] as unknown as JsonObject, keep: ['side'] },
};

// The design without the values equal to their defaults. Arrays stay whole.
function lean(value: Json, fallback: Json | undefined): Json | undefined {
  if (same(value, fallback)) return undefined;
  if (!isObject(value) || !isObject(fallback)) return value;
  const kept = Object.entries(value).flatMap(([key, inner]) => {
    const rest = lean(inner, fallback[key]);
    return rest === undefined ? [] : [[key, rest] as const];
  });
  return Object.fromEntries(kept);
}

// Put back each value that loads differently without it: some defaults depend on other fields.
function restore(target: { [key: string]: Json }, full: { [key: string]: Json }, loaded: { [key: string]: Json }) {
  for (const [key, value] of Object.entries(full)) {
    if (same(value, loaded[key])) continue;
    const inner = target[key];
    if (isObject(value) && isObject(inner) && isObject(loaded[key])) restore(inner, value, loaded[key]);
    else target[key] = value;
  }
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (character) => character.charCodeAt(0));

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/**
 * The design as a file or link carries it: only the settings it uses (`pruneConfig`), and of those
 * only the ones that differ from their defaults. It loads back to the pruned design, which builds
 * the same shed; should it not, the whole pruned design goes instead.
 */
export function compactDesign(config: ShedConfig): JsonObject {
  const pruned = serializeConfig(pruneConfig(config));
  const full = JSON.parse(pruned) as JsonObject;
  delete full.appVersion;
  const data: JsonObject = { schemaVersion: full.schemaVersion, ...(lean(full, DEFAULTS) as JsonObject) };
  for (const [key, { item, keep }] of Object.entries(ITEMS)) {
    const list = data[key];
    if (Array.isArray(list)) {
      data[key] = list.map((entry) =>
        Object.fromEntries(Object.entries(entry as JsonObject).filter(([name, value]) => keep.includes(name) || !same(value, item[name]))),
      );
    }
  }
  const loaded = parseConfigText(JSON.stringify(data));
  if (loaded.ok) restore(data, full, JSON.parse(serializeConfig(loaded.config)) as JsonObject);
  const check = parseConfigText(JSON.stringify(data));
  return check.ok && serializeConfig(check.config) === pruned ? data : full;
}

/** The design as a saved file's text: `compactDesign`, with the app version after the schema version. */
export function designFileText(config: ShedConfig): string {
  const { schemaVersion, ...design } = compactDesign(config);
  return `${JSON.stringify({ schemaVersion, appVersion: APP_VERSION, ...design }, null, 2)}\n`;
}

/**
 * The design as link data: `compactDesign`, deflated, in base64url. A link is a copy of the design
 * at the time it is made.
 */
export async function designToLink(config: ShedConfig): Promise<string> {
  const text = new TextEncoder().encode(JSON.stringify(compactDesign(config)));
  return toBase64Url(await pipe(text, new CompressionStream('deflate-raw')));
}

/** Read link data back into a design, with the same checks as opening a file. */
export async function designFromLink(data: string): Promise<ParseResult> {
  try {
    const bytes = await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw'));
    return parseConfigText(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, errors: ['The link is damaged or incomplete. Ask for the link again.'] };
  }
}

/** The link data in an address fragment, or null when the fragment carries no design. */
export const linkData = (hash: string) => (hash.startsWith(`#${LINK_KEY}`) ? hash.slice(LINK_KEY.length + 1) : null);
