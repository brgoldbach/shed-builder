/** Format inches as feet and inches to the nearest 1/16 in, for example `7' 8-5/8"`. */
export function formatLength(inches: number): string {
  return format(inches, true);
}

/** Format inches to the nearest 1/16 in without feet, for example `92-5/8"`. */
export function formatInches(inches: number): string {
  return format(inches, false);
}

function format(inches: number, withFeet: boolean): string {
  const sign = inches < 0 ? '-' : '';
  const sixteenths = Math.round(Math.abs(inches) * 16);
  const feet = withFeet ? Math.floor(sixteenths / 192) : 0;
  const rest = sixteenths - feet * 192;
  const whole = Math.floor(rest / 16);
  let numer = rest % 16;
  let denom = 16;
  while (numer && numer % 2 === 0) {
    numer /= 2;
    denom /= 2;
  }
  const fraction = numer ? `${numer}/${denom}` : '';
  const inchText = whole && fraction ? `${whole}-${fraction}` : fraction || `${whole}`;
  return feet ? `${sign}${feet}' ${inchText}"` : `${sign}${inchText}"`;
}

const DECIMAL = /^\d+(?:\.\d+)?$/;
// "92", "92.625", "92 5/8", "92-5/8", or "5/8".
const INCH_PART = /^(?:(\d+(?:\.\d+)?)(?:[\s-]+(\d+)\/(\d+))?|(\d+)\/(\d+))$/;

/**
 * Parse a length typed by the user. Returns inches, or null when the text is not a length.
 * A bare number is inches. Accepts `10'`, `10' 6"`, `10'-6"`, `10 ft 6 in`, `126`, `92 5/8`, `92-5/8"`.
 */
export function parseLength(text: string): number | null {
  let rest = text
    .trim()
    .replace(/\s*(?:ft|feet|foot)\b/gi, "'")
    .replace(/\s*(?:in|inch|inches)\b/gi, '"');
  let feet = 0;
  const tick = rest.indexOf("'");
  if (tick >= 0) {
    const feetText = rest.slice(0, tick).trim();
    if (!DECIMAL.test(feetText)) return null;
    feet = Number(feetText);
    rest = rest.slice(tick + 1).trim().replace(/^-\s*/, '');
  }
  rest = rest.replace(/"$/, '').trim();
  if (rest === '') return tick >= 0 ? feet * 12 : null;

  const match = INCH_PART.exec(rest);
  if (!match) return null;
  const [, whole, mixedNumer, mixedDenom, aloneNumer, aloneDenom] = match;
  const numer = mixedNumer ?? aloneNumer;
  const denom = mixedDenom ?? aloneDenom;
  if (denom !== undefined && Number(denom) === 0) return null;
  const fraction = numer ? Number(numer) / Number(denom) : 0;
  return feet * 12 + Number(whole ?? 0) + fraction;
}
