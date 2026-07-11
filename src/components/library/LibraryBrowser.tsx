import { useCallback, useMemo, useState } from "react";
import { useDevice } from "../../context/DeviceContext";
import { useOpdsCatalogs, type OpdsCatalog } from "../../hooks/useOpdsCatalogs";
import {
  fetchOpdsFeed,
  resolveOpenSearchTemplate,
  buildSearchUrl,
  buildAuthHeaders,
  filenameForAcquisition,
  formatAcquisitionLabel,
  type OpdsFeed,
  type OpdsEntry,
  type OpdsLink,
} from "../../lib/opds";
import { formatBytes } from "../../lib/firmwareAsset";
import { ProgressBar } from "../ProgressBar";
import "./LibraryBrowser.css";

const BOOKS_DIR = "/Books";

function authFor(catalog: OpdsCatalog | null) {
  if (!catalog?.username) return undefined;
  return { username: catalog.username, password: catalog.password };
}

export function LibraryBrowser() {
  const { connectionState, uploadFile, log } = useDevice();
  const { catalogs, addCatalog, removeCatalog } = useOpdsCatalogs();

  const [showAddForm, setShowAddForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");

  const [selectedCatalog, setSelectedCatalog] = useState<OpdsCatalog | null>(null);
  const [urlStack, setUrlStack] = useState<string[]>([]);
  const [feed, setFeed] = useState<OpdsFeed | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchTemplate, setSearchTemplate] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [sendPercent, setSendPercent] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);

  const [manualPath, setManualPath] = useState(BOOKS_DIR);
  const [manualUploading, setManualUploading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const isConnected = connectionState === "connected";

  const loadFeed = useCallback(
    async (url: string, catalog: OpdsCatalog | null) => {
      setIsLoading(true);
      setLoadError(null);
      setSearchTemplate(null);
      try {
        log(`Fetching OPDS feed: ${url}`);
        const result = await fetchOpdsFeed(url, authFor(catalog));
        setFeed(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? `${err.message} — this catalog may not allow cross-origin requests from the browser (no CORS support).`
            : "Failed to load this catalog.";
        setLoadError(message);
        log(message, "error");
        setFeed(null);
      } finally {
        setIsLoading(false);
      }
    },
    [log],
  );

  const handleAddCatalog = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!formName.trim() || !formUrl.trim()) return;
      const catalog = addCatalog({
        name: formName.trim(),
        url: formUrl.trim(),
        username: formUsername.trim(),
        password: formPassword,
      });
      setFormName("");
      setFormUrl("");
      setFormUsername("");
      setFormPassword("");
      setShowAddForm(false);
      setSelectedCatalog(catalog);
      setUrlStack([catalog.url]);
      void loadFeed(catalog.url, catalog);
    },
    [addCatalog, formName, formPassword, formUrl, formUsername, loadFeed],
  );

  const handleSelectCatalog = useCallback(
    (catalog: OpdsCatalog) => {
      setSelectedCatalog(catalog);
      setUrlStack([catalog.url]);
      setSearchQuery("");
      void loadFeed(catalog.url, catalog);
    },
    [loadFeed],
  );

  const handleNavigate = useCallback(
    (url: string) => {
      setUrlStack((prev) => [...prev, url]);
      void loadFeed(url, selectedCatalog);
    },
    [loadFeed, selectedCatalog],
  );

  const handleBack = useCallback(() => {
    setUrlStack((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.slice(0, -1);
      void loadFeed(next[next.length - 1], selectedCatalog);
      return next;
    });
  }, [loadFeed, selectedCatalog]);

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!feed?.searchHref || !searchQuery.trim()) return;
      setIsSearching(true);
      try {
        let template = searchTemplate;
        if (!template) {
          template = await resolveOpenSearchTemplate(feed.searchHref, authFor(selectedCatalog));
          setSearchTemplate(template);
        }
        if (!template) {
          setLoadError("Could not resolve this catalog's search template.");
          return;
        }
        const url = buildSearchUrl(template, searchQuery.trim());
        setUrlStack((prev) => [...prev, url]);
        await loadFeed(url, selectedCatalog);
      } finally {
        setIsSearching(false);
      }
    },
    [feed, loadFeed, searchQuery, searchTemplate, selectedCatalog],
  );

  const handleSendToDevice = useCallback(
    async (entry: OpdsEntry, link: OpdsLink) => {
      const key = `${entry.id}:${link.href}`;
      setSendingKey(key);
      setSendError(null);
      setSendPercent(0);
      try {
        log(`Downloading "${entry.title}" (${formatAcquisitionLabel(link)})…`);
        const response = await fetch(link.href, { headers: buildAuthHeaders(authFor(selectedCatalog)) });
        if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        log(`Downloaded ${formatBytes(bytes.byteLength)}.`, "success");

        const filename = filenameForAcquisition(entry.title, link);
        const path = `${BOOKS_DIR}/${filename}`;
        await uploadFile({ path, bytes, onProgress: (percent) => setSendPercent(percent) });
        log(`Sent ${filename} to device.`, "success");
      } catch (err) {
        const message =
          err instanceof Error
            ? `${err.message} — this book host may not allow cross-origin downloads. Use the ↗ link to save it manually, then upload it below.`
            : "Failed to send this book to the device.";
        setSendError(message);
        log(message, "error");
      } finally {
        setSendingKey(null);
      }
    },
    [log, selectedCatalog, uploadFile],
  );

  const handleManualUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setManualUploading(true);
      setManualError(null);
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const dir = manualPath.trim().replace(/\/+$/, "") || BOOKS_DIR;
        const path = `${dir}/${file.name}`;
        await uploadFile({ path, bytes });
        log(`Sent ${file.name} to device (${dir}).`, "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed.";
        setManualError(message);
        log(message, "error");
      } finally {
        setManualUploading(false);
        e.target.value = "";
      }
    },
    [log, manualPath, uploadFile],
  );

  const breadcrumbDepth = urlStack.length;
  const bookEntries = useMemo(() => feed?.entries.filter((e) => e.acquisitionLinks.length > 0) ?? [], [feed]);
  const navEntries = useMemo(() => feed?.entries.filter((e) => e.navigationHref) ?? [], [feed]);

  return (
    <div className="library section-panel">
      <h2 className="section-heading">Library</h2>
      <p className="section-subheading">
        Browse an OPDS book catalog and send titles straight to the device's /Books folder.
      </p>

      {!isConnected && <p className="library__hint">Connect a device from the sidebar to enable sending books.</p>}

      <div className="library__layout">
        <div className="library__catalogs">
          <h3 className="library__panel-title">Catalogs</h3>
          {catalogs.length === 0 && <p className="library__hint">No catalogs saved yet.</p>}
          <ul className="library__catalog-list">
            {catalogs.map((catalog) => (
              <li key={catalog.id}>
                <button
                  type="button"
                  className={`library__catalog-item${selectedCatalog?.id === catalog.id ? " library__catalog-item--active" : ""}`}
                  onClick={() => handleSelectCatalog(catalog)}
                >
                  {catalog.name}
                </button>
                <button
                  type="button"
                  className="library__catalog-remove"
                  aria-label={`Remove ${catalog.name}`}
                  onClick={() => removeCatalog(catalog.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {showAddForm ? (
            <form className="library__add-form" onSubmit={handleAddCatalog}>
              <input
                type="text"
                placeholder="Name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="library__input"
                required
              />
              <input
                type="url"
                placeholder="OPDS root URL"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className="library__input"
                required
              />
              <input
                type="text"
                placeholder="Username (optional)"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                className="library__input"
              />
              <input
                type="password"
                placeholder="Password (optional)"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="library__input"
              />
              <p className="library__hint">Stored in this browser's local storage, unencrypted.</p>
              <div className="library__add-actions">
                <button type="submit" className="button button--primary">
                  Save catalog
                </button>
                <button type="button" className="button button--outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="button button--outline library__add-button" onClick={() => setShowAddForm(true)}>
              + Add catalog
            </button>
          )}

          <div className="library__manual">
            <h3 className="library__panel-title">Upload a file you already have</h3>
            <label className="library__field">
              <span className="library__label">Destination folder</span>
              <input
                type="text"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                className="library__input"
              />
            </label>
            <input type="file" onChange={handleManualUpload} disabled={!isConnected || manualUploading} />
            {manualUploading && <p className="library__hint">Uploading…</p>}
            {manualError && <p className="library__error">{manualError}</p>}
          </div>
        </div>

        <div className="library__browser">
          {!selectedCatalog && <p className="library__hint">Select or add a catalog to start browsing.</p>}

          {selectedCatalog && (
            <>
              <div className="library__toolbar">
                <button type="button" className="button button--outline" disabled={breadcrumbDepth <= 1} onClick={handleBack}>
                  ← Back
                </button>
                {feed?.searchHref && (
                  <form className="library__search" onSubmit={handleSearch}>
                    <input
                      type="text"
                      placeholder="Search this catalog…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="library__input"
                    />
                    <button type="submit" className="button button--outline" disabled={isSearching || !searchQuery.trim()}>
                      {isSearching ? "…" : "Search"}
                    </button>
                  </form>
                )}
              </div>

              {isLoading && <p className="library__hint">Loading…</p>}
              {loadError && <p className="library__error">{loadError}</p>}

              {feed && !isLoading && (
                <>
                  <h3 className="library__feed-title">{feed.title}</h3>

                  {navEntries.length > 0 && (
                    <ul className="library__nav-list">
                      {navEntries.map((entry) => (
                        <li key={entry.id}>
                          <button type="button" className="library__nav-item" onClick={() => handleNavigate(entry.navigationHref!)}>
                            {entry.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <ul className="library__book-list">
                    {bookEntries.map((entry) => (
                      <li key={entry.id} className="library__book">
                        {entry.coverUrl && <img src={entry.coverUrl} alt="" className="library__cover" />}
                        <div className="library__book-info">
                          <p className="library__book-title">{entry.title}</p>
                          {entry.author && <p className="library__book-author">{entry.author}</p>}
                          <div className="library__book-actions">
                            {entry.acquisitionLinks.map((link) => {
                              const key = `${entry.id}:${link.href}`;
                              const isSending = sendingKey === key;
                              return (
                                <span key={key} className="library__format">
                                  <button
                                    type="button"
                                    className="button button--outline library__send-button"
                                    disabled={!isConnected || sendingKey !== null}
                                    onClick={() => handleSendToDevice(entry, link)}
                                  >
                                    {isSending
                                      ? "Sending…"
                                      : `Send ${formatAcquisitionLabel(link)}${link.length ? ` (${formatBytes(link.length)})` : ""}`}
                                  </button>
                                  <a href={link.href} target="_blank" rel="noreferrer" className="library__download-link" title="Open/save manually">
                                    ↗
                                  </a>
                                </span>
                              );
                            })}
                          </div>
                          {sendingKey?.startsWith(`${entry.id}:`) && <ProgressBar percent={sendPercent} phase="Sending to device" />}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {sendError && <p className="library__error">{sendError}</p>}

                  <div className="library__pagination">
                    {feed.prevHref && (
                      <button type="button" className="button button--outline" onClick={() => handleNavigate(feed.prevHref!)}>
                        ← Previous page
                      </button>
                    )}
                    {feed.nextHref && (
                      <button type="button" className="button button--outline" onClick={() => handleNavigate(feed.nextHref!)}>
                        Next page →
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
