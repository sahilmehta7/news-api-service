const RELATIVE_TIME_DIVISIONS = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" }
] as const satisfies Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }>;

type RelativeTimeUnit = (typeof RELATIVE_TIME_DIVISIONS)[number]["unit"];

const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>();
const numberFormatters = new Map<string, Intl.NumberFormat>();

export type FormatRelativeTimeOptions = {
  addSuffix?: boolean;
  locale?: string;
  style?: Intl.RelativeTimeFormatStyle;
  now?: number;
  fallback?: string;
};

export function formatRelativeTime(
  value: Date | string | number,
  options: FormatRelativeTimeOptions = {}
) {
  const timestamp = toTimestamp(value);
  if (!Number.isFinite(timestamp)) {
    return options.fallback ?? "—";
  }

  const locale = options.locale ?? "en-US";
  const style = options.style ?? "short";
  const reference = options.now ?? Date.now();
  let delta = (timestamp - reference) / 1000;

  for (const division of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(delta) < division.amount) {
      return options.addSuffix === false
        ? formatWithoutSuffix(delta, division.unit, locale, style)
        : getRelativeFormatter(locale, style).format(Math.round(delta), division.unit);
    }
    delta /= division.amount;
  }

  return options.fallback ?? "—";
}

function toTimestamp(value: Date | string | number) {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string") {
    return Date.parse(value);
  }
  if (typeof value === "number") {
    return value;
  }
  return Number.NaN;
}

function getRelativeFormatter(locale: string, style: Intl.RelativeTimeFormatStyle) {
  const key = `${locale}:${style}`;
  let formatter = relativeTimeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style });
    relativeTimeFormatters.set(key, formatter);
  }
  return formatter;
}

function getUnitFormatter(
  locale: string,
  unit: RelativeTimeUnit,
  style: Intl.RelativeTimeFormatStyle
) {
  const unitDisplay = style === "long" ? "long" : style === "narrow" ? "narrow" : "short";
  const key = `${locale}:${unit}:${unitDisplay}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay
    });
    numberFormatters.set(key, formatter);
  }
  return formatter;
}

function formatWithoutSuffix(
  delta: number,
  unit: RelativeTimeUnit,
  locale: string,
  style: Intl.RelativeTimeFormatStyle
) {
  const formatter = getUnitFormatter(locale, unit, style);
  return formatter.format(Math.abs(Math.round(delta)));
}

