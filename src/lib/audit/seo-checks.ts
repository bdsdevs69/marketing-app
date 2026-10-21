// Homepage SEO checks, worst first. Each failed check says what we saw and
// how to fix it; the score starts at 100 and loses points per problem.

import type { PageFacts } from './scan';

export type Severity = 'high' | 'medium' | 'low';
export type CheckGroup = 'Content' | 'Technical' | 'Sharing';

export interface CheckResult {
  id: string;
  group: CheckGroup;
  label: string; // what was checked, for the passed list
  passed: boolean;
  severity: Severity;
  problem?: string; // headline when it fails
  detail?: string; // what we saw
  fix?: string;
}

const PENALTY: Record<Severity, number> = { high: 12, medium: 6, low: 3 };
const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

const quote = (s: string, max = 90) => `“${s.length > max ? `${s.slice(0, max - 1)}…` : s}”`;

export function runSeoChecks(f: PageFacts) {
  const checks: CheckResult[] = [];
  const add = (c: CheckResult) => checks.push(c);

  // --- Content ---
  const titleLen = f.title.length;
  add(
    !f.title
      ? { id: 'title', group: 'Content', label: 'Page title', passed: false, severity: 'high', problem: 'No page title', detail: 'The homepage has no <title>, so search results show whatever Google guesses.', fix: 'Add a 50–60 character title: the main service first, the brand name last.' }
      : titleLen < 30 || titleLen > 60
        ? { id: 'title', group: 'Content', label: 'Page title', passed: false, severity: 'medium', problem: titleLen > 60 ? 'Page title runs long' : 'Page title is short', detail: `${quote(f.title)} is ${titleLen} characters; 30–60 shows in full in search results.`, fix: titleLen > 60 ? 'Trim it to 50–60 characters, keeping the main service up front.' : 'Lengthen it to 50–60 characters with the main service and location or audience.' }
        : { id: 'title', group: 'Content', label: 'Page title length', passed: true, severity: 'medium' }
  );

  const descLen = f.metaDescription.length;
  add(
    !f.metaDescription
      ? { id: 'description', group: 'Content', label: 'Meta description', passed: false, severity: 'medium', problem: 'No meta description', detail: 'Search engines will pull a random snippet from the page instead.', fix: 'Write a 140–160 character summary with the main service and a reason to click.' }
      : descLen < 70 || descLen > 160
        ? { id: 'description', group: 'Content', label: 'Meta description', passed: false, severity: 'medium', problem: descLen > 160 ? 'Meta description runs long' : 'Meta description is short', detail: `${descLen} characters (70–160 fits): ${quote(f.metaDescription)}`, fix: 'Rewrite it at 140–160 characters: what they offer, who it is for, and why click.' }
        : { id: 'description', group: 'Content', label: 'Meta description length', passed: true, severity: 'medium' }
  );

  add(
    f.h1.length === 0
      ? { id: 'h1', group: 'Content', label: 'Main heading', passed: false, severity: 'high', problem: 'No main heading (H1)', detail: 'The homepage has no <h1>, so search engines get no clear statement of what the page is about.', fix: 'Turn the hero line into one <h1> that names the main service.' }
      : f.h1.length > 1
        ? { id: 'h1', group: 'Content', label: 'Main heading', passed: false, severity: 'medium', problem: `${f.h1.length} main headings (H1)`, detail: `Found: ${f.h1.slice(0, 3).map((h) => quote(h, 50)).join(', ')}${f.h1.length > 3 ? '…' : ''}`, fix: 'Keep one <h1> for the page’s main message and make the others <h2>.' }
        : { id: 'h1', group: 'Content', label: 'One main heading (H1)', passed: true, severity: 'high' }
  );

  add(
    f.h2.length === 0
      ? { id: 'h2', group: 'Content', label: 'Section headings', passed: false, severity: 'low', problem: 'No section headings (H2)', detail: 'Without sub-headings the page reads as one block to search engines.', fix: 'Give each section an <h2> that names what it covers.' }
      : { id: 'h2', group: 'Content', label: 'Section headings (H2)', passed: true, severity: 'low' }
  );

  const missingAlt = f.images - f.imagesWithAlt;
  const altShare = f.images ? f.imagesWithAlt / f.images : 1;
  add(
    f.images > 0 && altShare < 0.9
      ? { id: 'alt', group: 'Content', label: 'Image descriptions', passed: false, severity: altShare < 0.5 ? 'medium' : 'low', problem: `${missingAlt} of ${f.images} images have no description`, detail: `${f.imagesWithAlt} of ${f.images} homepage images carry alt text.`, fix: 'Add a short alt text to every meaningful image saying what it shows.' }
      : { id: 'alt', group: 'Content', label: 'Image descriptions (alt text)', passed: true, severity: 'low' }
  );

  add(
    f.wordCount < 300
      ? { id: 'words', group: 'Content', label: 'Amount of text', passed: false, severity: 'low', problem: 'Very little text on the homepage', detail: `About ${f.wordCount} words. Thin pages give search engines little to rank.`, fix: 'Add 300+ words that explain the services, who they help and why them.' }
      : { id: 'words', group: 'Content', label: 'Enough text to rank', passed: true, severity: 'low' }
  );

  add(
    f.internalLinks < 10
      ? { id: 'links', group: 'Content', label: 'Internal links', passed: false, severity: 'low', problem: 'Few links to the rest of the site', detail: `${f.internalLinks} internal links from the homepage.`, fix: 'Link the homepage to key service, about and contact pages.' }
      : { id: 'links', group: 'Content', label: 'Links to the rest of the site', passed: true, severity: 'low' }
  );

  // --- Technical ---
  add(
    !f.https
      ? { id: 'https', group: 'Technical', label: 'Secure connection', passed: false, severity: 'high', problem: 'Site is not served over HTTPS', detail: 'Browsers label it “Not secure” and search engines favour secure sites.', fix: 'Install an SSL certificate and serve every page over https://.' }
      : { id: 'https', group: 'Technical', label: 'Secure connection (HTTPS)', passed: true, severity: 'high' }
  );

  if (f.https) {
    add(
      f.httpRedirectsToHttps === false
        ? { id: 'redirect', group: 'Technical', label: 'Redirect to HTTPS', passed: false, severity: 'medium', problem: 'http:// does not move to https://', detail: 'Visitors and links using http:// stay on the insecure version.', fix: 'Add a permanent (301) redirect from http:// to https://.' }
        : { id: 'redirect', group: 'Technical', label: 'http:// redirects to https://', passed: true, severity: 'medium' }
    );
  }

  add(
    !f.viewport
      ? { id: 'viewport', group: 'Technical', label: 'Mobile layout', passed: false, severity: 'high', problem: 'Not set up for phones', detail: 'No viewport tag, so phones show a zoomed-out desktop page.', fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' }
      : { id: 'viewport', group: 'Technical', label: 'Mobile-friendly setup', passed: true, severity: 'high' }
  );

  add(
    /noindex/.test(f.robotsMeta)
      ? { id: 'noindex', group: 'Technical', label: 'Allowed in search', passed: false, severity: 'high', problem: 'Homepage tells Google not to list it', detail: `The robots tag says “${f.robotsMeta}”.`, fix: 'Remove “noindex” from the homepage robots tag.' }
      : { id: 'noindex', group: 'Technical', label: 'Allowed in search results', passed: true, severity: 'high' }
  );

  add(
    !f.robotsTxt.found
      ? { id: 'robots', group: 'Technical', label: 'robots.txt', passed: false, severity: 'low', problem: 'No robots.txt file', detail: 'There are no crawl instructions for search engines.', fix: 'Add a robots.txt that allows crawling and points to the sitemap.' }
      : f.robotsTxt.blocksAll
        ? { id: 'robots', group: 'Technical', label: 'robots.txt', passed: false, severity: 'high', problem: 'robots.txt blocks every search engine', detail: '“Disallow: /” for all crawlers.', fix: 'Remove the blanket “Disallow: /” so the site can be indexed.' }
        : { id: 'robots', group: 'Technical', label: 'robots.txt in place', passed: true, severity: 'low' }
  );

  add(
    !f.sitemap.found
      ? { id: 'sitemap', group: 'Technical', label: 'Sitemap', passed: false, severity: 'medium', problem: 'No sitemap found', detail: 'Search engines have to find every page by following links.', fix: 'Publish /sitemap.xml and list it in robots.txt and Google Search Console.' }
      : { id: 'sitemap', group: 'Technical', label: 'Sitemap published', passed: true, severity: 'medium' }
  );

  add(
    !f.canonical
      ? { id: 'canonical', group: 'Technical', label: 'Canonical address', passed: false, severity: 'medium', problem: 'No canonical tag', detail: 'Copies of the page (with tracking codes, www. or not) can split ranking signals.', fix: 'Add <link rel="canonical"> pointing to the homepage’s main address.' }
      : { id: 'canonical', group: 'Technical', label: 'Canonical address set', passed: true, severity: 'medium' }
  );

  add(
    !f.lang
      ? { id: 'lang', group: 'Technical', label: 'Page language', passed: false, severity: 'low', problem: 'Page language not declared', detail: 'The <html> tag has no lang attribute.', fix: 'Add lang="en" (or the right language) to the <html> tag.' }
      : { id: 'lang', group: 'Technical', label: 'Page language declared', passed: true, severity: 'low' }
  );

  const seconds = f.responseMs / 1000;
  add(
    seconds > 1.5
      ? { id: 'speed', group: 'Technical', label: 'Server response', passed: false, severity: seconds > 3 ? 'medium' : 'low', problem: 'Slow first response', detail: `The homepage took ${seconds.toFixed(1)}s to answer (aim for under 1.5s).`, fix: 'Turn on page caching or a CDN, and check the hosting plan.' }
      : { id: 'speed', group: 'Technical', label: 'Fast server response', passed: true, severity: 'low' }
  );

  add(
    f.jsonLd === 0
      ? { id: 'schema', group: 'Technical', label: 'Structured data', passed: false, severity: 'medium', problem: 'No structured data', detail: 'Nothing tells search engines and AI assistants the business name, logo or contact details.', fix: 'Add Organization (or LocalBusiness) JSON-LD to the homepage.' }
      : { id: 'schema', group: 'Technical', label: 'Structured data present', passed: true, severity: 'medium' }
  );

  // --- Sharing ---
  const ogMissing = [!f.ogTitle && 'title', !f.ogDescription && 'description', !f.ogImage && 'image'].filter(Boolean) as string[];
  add(
    ogMissing.length
      ? { id: 'og', group: 'Sharing', label: 'Social previews', passed: false, severity: ogMissing.includes('image') ? 'medium' : 'low', problem: 'Incomplete social preview', detail: `Missing og:${ogMissing.join(', og:')} — shared links show a bare or random preview.`, fix: 'Add og:title, og:description and a 1200×630 og:image.' }
      : { id: 'og', group: 'Sharing', label: 'Social preview tags', passed: true, severity: 'medium' }
  );

  add(
    !f.twitterCard
      ? { id: 'twitter', group: 'Sharing', label: 'X / Twitter card', passed: false, severity: 'low', problem: 'No X (Twitter) card', detail: 'Links shared on X fall back to a small plain preview.', fix: 'Add <meta name="twitter:card" content="summary_large_image">.' }
      : { id: 'twitter', group: 'Sharing', label: 'X (Twitter) card', passed: true, severity: 'low' }
  );

  add(
    !f.favicon
      ? { id: 'favicon', group: 'Sharing', label: 'Site icon', passed: false, severity: 'low', problem: 'No site icon', detail: 'Browser tabs and some search results show a blank icon.', fix: 'Add a favicon and an apple-touch-icon.' }
      : { id: 'favicon', group: 'Sharing', label: 'Site icon (favicon)', passed: true, severity: 'low' }
  );

  const failed = checks.filter((c) => !c.passed).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const score = Math.max(0, 100 - failed.reduce((sum, c) => sum + PENALTY[c.severity], 0));
  return {
    score,
    rating: score >= 85 ? 'Strong' : score >= 65 ? 'Fair' : 'Needs work',
    total: checks.length,
    passed: checks.filter((c) => c.passed),
    failed,
    counts: {
      high: failed.filter((c) => c.severity === 'high').length,
      medium: failed.filter((c) => c.severity === 'medium').length,
      low: failed.filter((c) => c.severity === 'low').length,
    },
  };
}

export type SeoReport = ReturnType<typeof runSeoChecks>;
