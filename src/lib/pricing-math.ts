// Pure pricing maths shared by the API and the admin base-price editor, so the
// editor's previews can never disagree with what a user actually sees.

export interface PricingRule {
  min_price: number | string;
  max_price: number | string | null;
  addition_type: 'fixed' | 'percentage';
  addition_value: number | string;
}

export function roundToNearest50or100(num: number): number {
  const remainder = num % 100;
  if (remainder < 25) return Math.floor(num / 100) * 100;
  if (remainder < 75) return Math.floor(num / 100) * 100 + 50;
  return Math.ceil(num / 100) * 100;
}

// Used when a user has no pricing factor, and when no factor band matches.
export function fallbackMarkup(base: number): number {
  return base <= 500 ? base + 150 : base + base * 0.35;
}

export function applyRules(base: number, rules: PricingRule[]): number {
  for (const rule of rules) {
    const min = Number(rule.min_price);
    const max = rule.max_price === null || rule.max_price === '' ? null : Number(rule.max_price);
    const value = Number(rule.addition_value);
    if (base >= min && (max === null || base <= max)) {
      return rule.addition_type === 'fixed' ? base + value : base + (base * value) / 100;
    }
  }
  return fallbackMarkup(base);
}

// The price a user sees for a given base: their factor's bands if they have
// one, otherwise the fallback markup — always rounded to the nearest 50/100.
export function displayPrice(base: number, rules: PricingRule[] | null): number {
  const raw = rules && rules.length > 0 ? applyRules(base, rules) : fallbackMarkup(base);
  return roundToNearest50or100(raw);
}
