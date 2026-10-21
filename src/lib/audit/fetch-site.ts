// Fetching a client's website safely. The address comes from a partner, so
// every hop (including redirects) is checked to be a public internet host —
// never localhost, a private network or a cloud metadata address — and
// responses are capped in time and size.

import dns from 'dns/promises';
import net from 'net';

const UA = 'Mozilla/5.0 (compatible; DNA-ClientAudit/1.0; +https://dnapricing.com)';
const MAX_REDIRECTS = 5;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true;
  if (v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')) return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIp(mapped[1]) : false;
}

async function assertPublicHost(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only web addresses can be audited');
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('Only standard web ports can be audited');
  const host = url.hostname;
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('That address is not a public website');
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) throw new Error('That address is not a public website');
}

export interface FetchedPage {
  ok: boolean;
  status: number;
  finalUrl: string;
  redirects: string[];
  contentType: string;
  body: string;
  ms: number;
}

// GET a URL, following up to five redirects, each re-checked. Reads at most
// `maxBytes` of the body.
export async function safeFetch(rawUrl: string, { timeoutMs = 10000, maxBytes = 1_500_000 } = {}): Promise<FetchedPage> {
  const started = Date.now();
  const redirects: string[] = [];
  let url = new URL(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      redirects.push(url.toString());
      url = new URL(location, url);
      continue;
    }

    let body = '';
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let received = 0;
      while (received < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        body += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    }

    return {
      ok: res.ok,
      status: res.status,
      finalUrl: url.toString(),
      redirects,
      contentType: res.headers.get('content-type') ?? '',
      body,
      ms: Date.now() - started,
    };
  }
  throw new Error('Too many redirects');
}

// "https://www.Client.com/about?x=1" or "client.com" -> "client.com".
export function normaliseDomain(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  } catch {
    return null;
  }
}
