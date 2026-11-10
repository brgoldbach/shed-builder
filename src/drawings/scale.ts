/** A plan scale: paper inches per foot of building. */
export interface PlanScale {
  inchesPerFoot: number;
  label: string;
}

// Architectural scales, largest first.
export const SCALES: readonly PlanScale[] = [
  { inchesPerFoot: 3, label: `3" = 1'-0"` },
  { inchesPerFoot: 1.5, label: `1-1/2" = 1'-0"` },
  { inchesPerFoot: 1, label: `1" = 1'-0"` },
  { inchesPerFoot: 0.75, label: `3/4" = 1'-0"` },
  { inchesPerFoot: 0.5, label: `1/2" = 1'-0"` },
  { inchesPerFoot: 0.375, label: `3/8" = 1'-0"` },
  { inchesPerFoot: 0.25, label: `1/4" = 1'-0"` },
  { inchesPerFoot: 0.1875, label: `3/16" = 1'-0"` },
  { inchesPerFoot: 0.125, label: `1/8" = 1'-0"` },
  { inchesPerFoot: 0.09375, label: `3/32" = 1'-0"` },
  { inchesPerFoot: 0.0625, label: `1/16" = 1'-0"` },
];

/** Points of paper (1/72 in) per inch of building at a scale. */
export const pointsPerInch = ({ inchesPerFoot }: PlanScale) => (inchesPerFoot / 12) * 72;

/**
 * The largest scale at which a drawing fits `area`, or null when none does. `size` gives the
 * drawing's size in points at a number of points per building inch.
 */
export function pickScale(
  size: (pointsPerInch: number) => { width: number; height: number },
  area: { width: number; height: number },
): PlanScale | null {
  return (
    SCALES.find((scale) => {
      const { width, height } = size(pointsPerInch(scale));
      return width <= area.width && height <= area.height;
    }) ?? null
  );
}
