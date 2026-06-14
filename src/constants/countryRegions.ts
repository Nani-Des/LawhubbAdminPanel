import { DEFAULT_COUNTRY_CODE } from './countries';

/** Ghana local areas — stored as `Region` on Users */
export const GHANA_REGION_OPTIONS = [
  'Western North',
  'Western',
  'Oti',
  'Bono',
  'Bono East',
  'Ahafo',
  'Greater Accra',
  'Eastern',
  'Central',
  'Northern',
  'Savannah',
  'North East',
  'Volta',
  'Upper East',
  'Upper West',
  'Ashanti',
] as const;

export const GHANA_REGION_SELECT_OPTIONS = [
  'Select a region',
  ...GHANA_REGION_OPTIONS,
] as const;

export function isGhanaCountry(code: string | undefined): boolean {
  const c = (code || DEFAULT_COUNTRY_CODE).trim().toUpperCase();
  return c === 'GH';
}

export function regionFieldLabel(countryCode: string | undefined): string {
  return isGhanaCountry(countryCode) ? 'Region (Ghana)' : 'State / province / region';
}

export function isValidRegionForCountry(
  countryCode: string | undefined,
  region: string | undefined
): boolean {
  const r = (region || '').trim();
  if (!r || r === 'Select a region') return false;
  if (isGhanaCountry(countryCode)) {
    return GHANA_REGION_OPTIONS.includes(r as (typeof GHANA_REGION_OPTIONS)[number]);
  }
  return r.length >= 2;
}
