// The one test every reported feature has to pass: the article itself links
// to the client's domain, or prints it. A brand or a person's name is never
// enough — names are shared, a domain isn't.

// Site furniture an outlet repeats on every page (menus, footers, sidebars)
// isn't the article, and neither are readers' comments.
const SCRIPTS = /<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi;
const FURNITURE = /<(nav|footer|aside|header|form)\b[\s\S]*?<\/\1>/gi;
const COMMENTS = /id=["']?(?:comments|respond|disqus_thread)\b|class=["'][^"']*\b(?:comments-area|comment-list|commentlist)\b/i;

const ANCHOR = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^>]*>/gi;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "client.com" and its subdomains; "notclient.com" or "client.com.au" don't count.
export const isDomainHost = (host: string, domain: string) => {
  const h = host.toLowerCase().replace(/^www\./, '');
  return h === domain || h.endsWith(`.${domain}`);
};

function articleOnly(html: string) {
  let body = html.replace(SCRIPTS, ' ');
  const comments = body.search(COMMENTS);
  if (comments > 0) body = body.slice(0, comments);
  return body.replace(FURNITURE, ' ');
}

export function linksTo(html: string, domain: string): boolean {
  const body = articleOnly(html);

  for (const m of body.matchAll(ANCHOR)) {
    // Links readers add ("ugc") are theirs, not the publisher's.
    if (/\brel\s*=\s*["']?[^"'>]*\bugc\b/i.test(m[0])) continue;
    const href = (m[1] ?? m[2] ?? m[3] ?? '').replace(/&amp;/g, '&').trim();
    if (!/^(https?:)?\/\//i.test(href)) continue;
    try {
      if (isDomainHost(new URL(href, 'https://x.invalid').hostname, domain)) return true;
    } catch {
      // not a usable address
    }
  }

  const text = body.replace(/<[^>]+>/g, ' ').replace(/&#0*46;|&period;/g, '.');
  return new RegExp(`(?<![a-z0-9-])(?:www\\.)?${escape(domain)}(?![a-z0-9-]|\\.[a-z0-9])`, 'i').test(text);
}
