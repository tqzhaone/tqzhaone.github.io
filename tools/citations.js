#!/usr/bin/env node
/*
 * Citation counts for the Publications page, fetched at deploy time (the deploy workflow runs this
 * before tools/build-site.js, and once a day on a schedule).
 *
 * For each paper on the page (its DOI, from site/publications/papers.html) it asks OpenAlex for the
 * number of works that cite it, and Crossref if OpenAlex has no answer. When neither answers, it keeps
 * the number the live site showed last time (https://tqzhaone.github.io/publications/citations.json), so
 * a bad day at either service never blanks the page. The result goes to
 * site/publications/citations.json, which build-site.js reads; without it the page simply shows no
 * counts.
 *
 * OpenAlex has asked for a (free) API key since February 2026. Put one in the repository secret
 * OPENALEX_API_KEY and the workflow hands it over here; without it OpenAlex may refuse, and the counts
 * come from Crossref instead (usually a little lower, since Crossref only sees reference lists that
 * publishers deposit with it).
 *
 * Needs only Node 18 or newer (built-in fetch). Exits 0 even when nothing could be fetched.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const SITE = path.join(__dirname, "..", "site");
const OUT = path.join(SITE, "publications", "citations.json");
const LIVE = "https://tqzhaone.github.io/publications/citations.json";
const KEY = (process.env.OPENALEX_API_KEY || "").trim();

function dois() {
  const html = fs.readFileSync(path.join(SITE, "publications", "papers.html"), "utf8");
  const found = [...html.matchAll(/<h3 class="pub__title"><a href="https:\/\/doi\.org\/([^"]+)"/g)].map((m) => m[1].toLowerCase());
  return [...new Set(found)];
}

async function json(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "tqzhaone.github.io citation counts (https://tqzhaone.github.io)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const error = new Error(`${response.status} ${url.replace(/api_key=[^&]+/, "api_key=***")}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

let openalexRefused = false;

async function openalex(doi) {
  // A refusal (no key, bad key, budget spent) will not change for the next paper, so ask only once.
  if (openalexRefused) throw Object.assign(new Error("skipped"), { quiet: true });
  const key = KEY ? `?api_key=${encodeURIComponent(KEY)}` : "";
  let data;
  try {
    data = await json(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi).replace(/%2F/g, "/")}${key}`);
  } catch (error) {
    if ([401, 403, 409, 429].includes(error.status)) {
      openalexRefused = true;
      if (!KEY) console.log("  (OpenAlex wants an API key: add the repository secret OPENALEX_API_KEY)");
    }
    throw error;
  }
  if (typeof data.cited_by_count !== "number") throw new Error("no cited_by_count");
  return data.cited_by_count;
}

async function crossref(doi) {
  const data = await json(`https://api.crossref.org/works/${encodeURIComponent(doi).replace(/%2F/g, "/")}`);
  const n = data && data.message && data.message["is-referenced-by-count"];
  if (typeof n !== "number") throw new Error("no is-referenced-by-count");
  return n;
}

async function main() {
  const list = dois();
  let previous = {};
  try {
    previous = (await json(LIVE)).counts || {};
  } catch (error) {
    // First run, or the site is unreachable: nothing to fall back on.
  }
  const counts = {};
  const sources = {};
  for (const doi of list) {
    for (const [name, get] of [["OpenAlex", openalex], ["Crossref", crossref]]) {
      try {
        counts[doi] = await get(doi);
        sources[doi] = name;
        break;
      } catch (error) {
        if (!error.quiet) console.log(`  ${name} had no count for ${doi}: ${error.message}`);
      }
    }
    if (!(doi in counts) && typeof previous[doi] === "number") {
      counts[doi] = previous[doi];
      sources[doi] = "previous";
    }
  }
  const got = Object.keys(counts).length;
  if (!got) {
    console.log("citations: no counts this time; the page will show none");
    return;
  }
  const out = { updated: new Date().toISOString().slice(0, 10), counts, sources };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const by = {};
  for (const name of Object.values(sources)) by[name] = (by[name] || 0) + 1;
  const from = Object.entries(by).map(([name, n]) => `${name} ${n}`).join(", ");
  console.log(`citations: ${got} of ${list.length} papers, ${total} citations in all (${from})`);
}

main().catch((error) => {
  console.log("citations: skipped:", error.message);
});
