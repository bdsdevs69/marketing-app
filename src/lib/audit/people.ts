// The people a business puts forward — founder, CEO, the doctor on the
// homepage. Press often names them rather than the company ("Dr. Kirk
// Sanford Wants More Honesty in Regenerative Medicine"), so their names are
// searched alongside the brand.

import { parse } from 'node-html-parser';

const NAME = "[A-Z][a-z]+(?:\\s[A-Z]\\.)?\\s[A-Z][a-zA-Z'’-]+";
const ROLE = '(?:founder|co-founder|ceo|chief executive|president|medical director|managing director|owner)';
const NOT_PEOPLE = /^(read more|learn more|contact us|privacy policy|united states|new york|los angeles|san francisco|south africa)$/i;

export function findPeople(html: string, brand: string, limit = 2): string[] {
  const root = parse(html);
  const scores = new Map<string, number>();
  const bump = (name: string, by: number) => {
    const clean = name.replace(/\s+/g, ' ').trim();
    if (clean.split(' ').length < 2 || NOT_PEOPLE.test(clean) || brand.toLowerCase().includes(clean.toLowerCase())) return;
    scores.set(clean, (scores.get(clean) ?? 0) + by);
  };

  // Structured data: "founder": {...,"name": "..."} and Person entries.
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    for (const m of script.text.matchAll(/"(?:founder|employee|author)"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]{4,60})"/g)) bump(m[1], 5);
    for (const m of script.text.matchAll(/"@type"\s*:\s*"Person"[^}]*?"name"\s*:\s*"([^"]{4,60})"/g)) bump(m[1], 5);
  }

  root.querySelectorAll('script,style,noscript,svg').forEach((n) => n.remove());
  const text = root.text.replace(/\s+/g, ' ');
  for (const m of text.matchAll(new RegExp(`\\bDr\\.?\\s+(${NAME})`, 'g'))) bump(m[1], 2);
  for (const m of text.matchAll(new RegExp(`\\b${ROLE}[,:]?\\s+(?:and\\s+\\w+\\s+)?(?:Dr\\.?\\s+)?(${NAME})`, 'gi'))) bump(m[1], 3);
  for (const m of text.matchAll(new RegExp(`(${NAME}),?\\s+(?:the\\s+|our\\s+)?${ROLE}`, 'g'))) bump(m[1], 3);

  return [...scores.entries()]
    .filter(([, score]) => score >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}
