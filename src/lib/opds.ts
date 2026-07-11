/**
 * Client-side OPDS (Open Publication Distribution System) catalog client.
 * Parses Atom+OPDS XML with the native DOMParser — no dependency needed.
 *
 * Verified against a real catalog (Project Gutenberg's OPDS feed) while
 * building this: the feed endpoint sends `Access-Control-Allow-Origin: *`
 * and browses fine from a third-party page, but the actual book file host
 * (gutenberg.org/cache/epub/...) does not — mirroring the same pattern as
 * GitHub's release API vs. release-asset host. Browsing a CORS-friendly
 * catalog always works; downloading a given book's file only works if
 * that specific host also allows it. Both cases are handled by the UI.
 */

const ATOM_NS = "http://www.w3.org/2005/Atom";
const OPDS_ACQUISITION_REL = "http://opds-spec.org/acquisition";
const OPDS_IMAGE_REL = "http://opds-spec.org/image";

export interface OpdsAuth {
  username: string;
  password: string;
}

export interface OpdsLink {
  rel: string;
  type: string;
  href: string;
  title?: string;
  length?: number;
}

export interface OpdsEntry {
  id: string;
  title: string;
  author: string | null;
  summary: string | null;
  updated: string | null;
  coverUrl: string | null;
  /** Links with an acquisition (download) relation — present on actual books. */
  acquisitionLinks: OpdsLink[];
  /** Where to navigate for more detail (a subsection/sub-catalog), if this isn't a book. */
  navigationHref: string | null;
}

export interface OpdsFeed {
  title: string;
  entries: OpdsEntry[];
  nextHref: string | null;
  prevHref: string | null;
  searchHref: string | null;
}

function text(el: Element | null | undefined): string | null {
  return el?.textContent?.trim() || null;
}

function resolveHref(href: string | undefined, baseUrl: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function directAtomChildren(el: Element, localName: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === localName && c.namespaceURI === ATOM_NS);
}

function parseLinkEl(el: Element, baseUrl: string): OpdsLink {
  return {
    rel: el.getAttribute("rel") ?? "",
    type: el.getAttribute("type") ?? "",
    href: resolveHref(el.getAttribute("href") ?? undefined, baseUrl) ?? el.getAttribute("href") ?? "",
    title: el.getAttribute("title") ?? undefined,
    length: el.getAttribute("length") ? Number(el.getAttribute("length")) : undefined,
  };
}

function parseEntryEl(entryEl: Element, baseUrl: string): OpdsEntry {
  const id = text(directAtomChildren(entryEl, "id")[0]) ?? crypto.randomUUID();
  const title = text(directAtomChildren(entryEl, "title")[0]) ?? "Untitled";
  const updated = text(directAtomChildren(entryEl, "updated")[0]);

  const authorEl = directAtomChildren(entryEl, "author")[0];
  const author = authorEl ? text(directAtomChildren(authorEl, "name")[0]) : null;

  const summaryEl = directAtomChildren(entryEl, "summary")[0] ?? directAtomChildren(entryEl, "content")[0];
  const summary = text(summaryEl);

  const links = directAtomChildren(entryEl, "link").map((el) => parseLinkEl(el, baseUrl));

  const coverLink =
    links.find((l) => l.rel.startsWith(OPDS_IMAGE_REL) && !l.rel.includes("thumbnail")) ??
    links.find((l) => l.rel.startsWith(OPDS_IMAGE_REL));

  const acquisitionLinks = links.filter((l) => l.rel.startsWith(OPDS_ACQUISITION_REL));

  const navLink = links.find(
    (l) => l.rel === "subsection" || (l.rel === "alternate" && l.type.includes("opds-catalog")),
  );

  return {
    id,
    title,
    author,
    summary,
    updated,
    coverUrl: coverLink?.href ?? null,
    acquisitionLinks,
    // Only treat as "browse further" when there's nothing to download directly yet.
    navigationHref: acquisitionLinks.length === 0 ? (navLink?.href ?? null) : null,
  };
}

export function parseOpdsFeed(xmlText: string, baseUrl: string): OpdsFeed {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Could not parse this catalog's response as an OPDS/Atom feed.");
  }

  const feedEl = doc.documentElement;
  const title = text(directAtomChildren(feedEl, "title")[0]) ?? "Untitled Catalog";
  const feedLinks = directAtomChildren(feedEl, "link").map((el) => parseLinkEl(el, baseUrl));

  const nextHref = feedLinks.find((l) => l.rel === "next")?.href ?? null;
  const prevHref = feedLinks.find((l) => l.rel === "previous" || l.rel === "prev")?.href ?? null;
  const searchHref = feedLinks.find((l) => l.rel === "search")?.href ?? null;

  const entries = directAtomChildren(feedEl, "entry").map((el) => parseEntryEl(el, baseUrl));

  return { title, entries, nextHref, prevHref, searchHref };
}

export function buildAuthHeaders(auth?: OpdsAuth): HeadersInit | undefined {
  if (!auth?.username) return undefined;
  return { Authorization: `Basic ${btoa(`${auth.username}:${auth.password ?? ""}`)}` };
}

export async function fetchOpdsFeed(url: string, auth?: OpdsAuth): Promise<OpdsFeed> {
  const response = await fetch(url, {
    headers: { Accept: "application/atom+xml,application/xml,text/xml", ...buildAuthHeaders(auth) },
  });
  if (!response.ok) {
    throw new Error(`Catalog request failed: ${response.status} ${response.statusText}`);
  }
  const xmlText = await response.text();
  return parseOpdsFeed(xmlText, url);
}

/** Resolves an OpenSearch description document to its Atom search URL template. */
export async function resolveOpenSearchTemplate(osdUrl: string, auth?: OpdsAuth): Promise<string | null> {
  const response = await fetch(osdUrl, { headers: buildAuthHeaders(auth) });
  if (!response.ok) return null;
  const doc = new DOMParser().parseFromString(await response.text(), "application/xml");
  const urls = Array.from(doc.getElementsByTagName("Url"));
  const atomUrl = urls.find((u) => (u.getAttribute("type") ?? "").includes("atom")) ?? urls[0];
  return atomUrl?.getAttribute("template") ?? null;
}

export function buildSearchUrl(template: string, query: string): string {
  return template
    .replace(/\{searchTerms\??\}/gi, encodeURIComponent(query))
    .replace(/\{[^}]*\?\}/g, "")
    .replace(/\{[^}]*\}/g, "");
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "application/epub+zip": "epub",
  "application/x-mobipocket-ebook": "mobi",
  "application/vnd.amazon.ebook": "azw",
  "application/vnd.amazon.mobi8-ebook": "azw3",
  "application/pdf": "pdf",
  "application/fb2+zip": "fb2.zip",
  "application/x-fictionbook+xml": "fb2",
  "text/plain": "txt",
};

export function filenameForAcquisition(title: string, link: OpdsLink): string {
  const ext = EXTENSION_BY_TYPE[link.type] ?? "bin";
  const safe =
    title
      .replace(/[^a-zA-Z0-9 _-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "book";
  return `${safe}.${ext}`;
}

export function formatAcquisitionLabel(link: OpdsLink): string {
  return link.title || EXTENSION_BY_TYPE[link.type]?.toUpperCase() || link.type || "Download";
}
