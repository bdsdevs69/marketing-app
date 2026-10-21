// Markets a client can be audited for. `region` is the name used in the
// publication catalogue's regions, so fits can be matched to where the
// client sells.
export interface Market {
  code: string;
  label: string;
  region: string;
}

export const MARKETS: Market[] = [
  { code: 'us', label: 'United States', region: 'United States' },
  { code: 'uk', label: 'United Kingdom', region: 'United Kingdom' },
  { code: 'ca', label: 'Canada', region: 'Canada' },
  { code: 'au', label: 'Australia', region: 'Australia' },
  { code: 'ie', label: 'Ireland', region: 'Ireland' },
  { code: 'de', label: 'Germany', region: 'Germany' },
  { code: 'fr', label: 'France', region: 'France' },
  { code: 'es', label: 'Spain', region: 'Spain' },
  { code: 'it', label: 'Italy', region: 'Italy' },
  { code: 'nl', label: 'Netherlands', region: 'Netherlands' },
  { code: 'ae', label: 'UAE', region: 'UAE' },
  { code: 'in', label: 'India', region: 'India' },
  { code: 'sg', label: 'Singapore', region: 'Singapore' },
  { code: 'za', label: 'South Africa', region: 'South Africa' },
  { code: 'br', label: 'Brazil', region: 'Brazil' },
  { code: 'mx', label: 'Mexico', region: 'Mexico' },
];

export const marketByCode = (code: string) => MARKETS.find((m) => m.code === code) ?? null;
