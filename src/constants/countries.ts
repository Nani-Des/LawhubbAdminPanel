/** ISO 3166-1 alpha-2. Legacy data without `Country` is treated as Ghana (GH). */
export const DEFAULT_COUNTRY_CODE = 'GH';

export type CountryOption = { code: string; name: string };

import iso3166 from './iso3166_countries.json';

/** Full ISO 3166-1 alpha-2 list (sorted by country name). */
export const COUNTRY_OPTIONS: CountryOption[] = (
  iso3166 as { name: string; 'alpha-2': string }[]
)
  .map((r) => ({
    code: String(r['alpha-2'] ?? '')
      .trim()
      .toUpperCase(),
    name: r.name,
  }))
  .filter((r) => r.code.length === 2)
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));

export function effectiveCountryCode(row: Record<string, unknown> | null | undefined): string {
  const raw = row?.Country ?? row?.country;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim().toUpperCase();
  }
  return DEFAULT_COUNTRY_CODE;
}

export function countryNameFromCode(code: string | undefined): string {
  if (!code) return '';
  const u = code.trim().toUpperCase();
  return COUNTRY_OPTIONS.find((c) => c.code === u)?.name ?? u;
}
