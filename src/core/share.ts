import { parseConfigText, serializeConfig, shedSchema, type ParseResult, type ShedConfig } from './config';

/** The address fragment that carries a design: `#design=<data>`. */
export const LINK_KEY = 'design=';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const isObject = (value: Json | undefined): value is { [key: string]: Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const same = (first: Json | undefined, second: Json | undefined) => JSON.stringify(first) === JSON.stringify(second);

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
 * The design as link data: its JSON without the default values, deflated, in base64url. It loads
 * back to the same design. A link is a copy of the design at the time it is made.
 */
export async function designToLink(config: ShedConfig): Promise<string> {
  const full = JSON.parse(serializeConfig(config)) as { [key: string]: Json };
  const defaults = JSON.parse(serializeConfig(shedSchema.parse({ schemaVersion: 1 }))) as Json;
  const data = { ...(lean(full, defaults) as { [key: string]: Json }), schemaVersion: full.schemaVersion };
  const loaded = parseConfigText(JSON.stringify(data));
  if (loaded.ok) restore(data, full, JSON.parse(serializeConfig(loaded.config)) as { [key: string]: Json });
  const text = new TextEncoder().encode(JSON.stringify(data));
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
