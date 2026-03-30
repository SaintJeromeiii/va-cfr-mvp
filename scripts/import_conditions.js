#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ECFR_URL = 'https://www.ecfr.gov/current/title-38/chapter-I/part-4/subpart-B';

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.text();
}

function extractCodesFromDocument(dom) {
  const results = new Map();
  const body = dom.window.document.body;

  // Search through table cells and other block elements first
  const candidates = Array.from(body.querySelectorAll('td, th, li, p, h1, h2, h3, h4'));
  const re = /\b(\d{3,4})\b[^\S\r\n:|\-]*([^\n\r|]{3,120})/g;

  for (const el of candidates) {
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    let m;
    while ((m = re.exec(txt)) !== null) {
      const code = m[1].trim();
      let title = m[2].trim();
      // strip trailing punctuation or stray words
      title = title.split('|')[0].split(':')[0].trim();
      if (title.length > 1 && !results.has(code)) results.set(code, title);
    }
  }

  // Fallback: search entire textContent
  if (results.size === 0) {
    const text = body.textContent || '';
    let m2;
    while ((m2 = re.exec(text)) !== null) {
      const code = m2[1].trim();
      let title = m2[2].trim().split('|')[0].split(':')[0].trim();
      if (title.length > 1 && !results.has(code)) results.set(code, title);
    }
  }

  return results;
}

async function main() {
  console.log('Fetching eCFR Part 4 (Subpart B)...');
  const html = await fetchHtml(ECFR_URL);
  const dom = new JSDOM(html);

  console.log('Extracting diagnostic codes...');
  const codes = extractCodesFromDocument(dom);
  console.log(`Found ${codes.size} candidate codes.`);

  const out = [];
  for (const [code, title] of codes) {
    out.push({
      id: `dc_${code}`,
      diagnostic_code: code,
      name: title,
      body_system: null,
      aliases: [],
      cfr: [
        {
          section: '38 CFR Part 4 Subpart B',
          diagnostic_code: code,
          title,
          url: ECFR_URL
        }
      ],
      rating_logic: {},
      evidence_checklist: [],
      disclaimer: 'Auto-imported skeleton from eCFR; needs manual enrichment.'
    });
  }

  const outPath = path.join(process.cwd(), 'data', 'conditions-skeleton.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote skeleton to ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
