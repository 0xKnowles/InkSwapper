import { useCallback, useMemo, useState } from "react";
import { useDevice } from "../../context/DeviceContext";
import { buildReorganizePlan, groupByAuthor, UNKNOWN_AUTHOR, type ReorganizeItem } from "../../lib/bookOrganizer";
import "./CleanUpBooks.css";

const BOOKS_DIR = "/Books";

type ItemStatus = "pending" | "moving" | "done" | "error";

export function CleanUpBooks() {
  const { mode, listFiles, moveFile, makeDirectory, log } = useDevice();

  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ReorganizeItem[] | null>(null);

  const [isOrganizing, setIsOrganizing] = useState(false);
  const [itemStatus, setItemStatus] = useState<Record<string, ItemStatus>>({});
  const [organizeError, setOrganizeError] = useState<string | null>(null);
  const [organizeDone, setOrganizeDone] = useState(false);

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    setScanError(null);
    setPlan(null);
    setOrganizeDone(false);
    setItemStatus({});
    try {
      log(`Scanning ${BOOKS_DIR}…`);
      const files = await listFiles(BOOKS_DIR);
      const built = buildReorganizePlan(BOOKS_DIR, files);
      log(
        built.length === 0 ? `${BOOKS_DIR} has no loose files to organize.` : `Found ${built.length} file(s) to review.`,
        built.length === 0 ? "success" : "info",
      );
      setPlan(built);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to scan /Books.";
      setScanError(message);
      log(message, "error");
    } finally {
      setIsScanning(false);
    }
  }, [listFiles, log]);

  const groups = useMemo(() => (plan ? groupByAuthor(plan) : []), [plan]);
  const includedCount = plan?.filter((i) => i.include).length ?? 0;
  const includedGroupCount = new Set(plan?.filter((i) => i.include).map((i) => i.author)).size;

  const updateItem = useCallback((currentPath: string, patch: Partial<Pick<ReorganizeItem, "author" | "include">>) => {
    setPlan((prev) =>
      prev?.map((item) => {
        if (item.currentPath !== currentPath) return item;
        const next = { ...item, ...patch };
        if (patch.author !== undefined) {
          next.targetPath = `${BOOKS_DIR}/${patch.author || UNKNOWN_AUTHOR}/${next.file.name}`;
        }
        return next;
      }) ?? null,
    );
  }, []);

  const handleOrganize = useCallback(async () => {
    if (!plan) return;
    setIsOrganizing(true);
    setOrganizeError(null);
    setOrganizeDone(false);

    const byAuthor = groupByAuthor(plan.filter((i) => i.include));

    try {
      for (const group of byAuthor) {
        const folderPath = `${BOOKS_DIR}/${group.author}`;
        try {
          await makeDirectory(folderPath);
        } catch {
          // Folder may already exist — that's fine, files still get moved into it below.
        }

        for (const item of group.items) {
          setItemStatus((prev) => ({ ...prev, [item.currentPath]: "moving" }));
          try {
            await moveFile(item.currentPath, item.targetPath);
            setItemStatus((prev) => ({ ...prev, [item.currentPath]: "done" }));
          } catch (err) {
            setItemStatus((prev) => ({ ...prev, [item.currentPath]: "error" }));
            log(`Failed to move ${item.file.name}: ${err instanceof Error ? err.message : "unknown error"}`, "error");
          }
        }
      }
      log("Clean up complete.", "success");
      setOrganizeDone(true);
    } catch (err) {
      setOrganizeError(err instanceof Error ? err.message : "Organizing failed for an unknown reason.");
    } finally {
      setIsOrganizing(false);
    }
  }, [log, makeDirectory, moveFile, plan]);

  return (
    <div className="cleanup section-panel">
      <h2 className="section-heading">Clean Up</h2>
      <p className="section-subheading">
        Scans /Books for loose files and groups them into per-author folders. Author names are guessed from
        filenames, not real book metadata — review and correct them before organizing.
      </p>

      {mode === "wireless" && (
        <p className="cleanup__hint">
          Over Wireless this needs the device firmware to send CORS headers for /api/files, /move, and /mkdir —
          stock CrossPoint firmware doesn't. If Scan fails with a network/CORS-shaped error, use USB Serial instead
          (or apply the crossink-cors.patch and reflash).
        </p>
      )}

      <button type="button" className="button button--primary" disabled={isScanning || isOrganizing} onClick={handleScan}>
        {isScanning ? "Scanning…" : "Scan /Books"}
      </button>

      {scanError && <p className="cleanup__error">{scanError}</p>}

      {plan && plan.length === 0 && <p className="cleanup__hint">No loose files found — /Books is already organized.</p>}

      {plan && plan.length > 0 && (
        <>
          <div className="cleanup__groups">
            {groups.map((group) => (
              <div key={group.author} className="cleanup__group">
                <h3 className="cleanup__group-title">
                  {group.author} <span className="cleanup__group-count">({group.items.length})</span>
                </h3>
                <ul className="cleanup__file-list">
                  {group.items.map((item) => {
                    const status = itemStatus[item.currentPath] ?? "pending";
                    return (
                      <li
                        key={item.currentPath}
                        className={`cleanup__file-row${item.include ? "" : " cleanup__file-row--excluded"}`}
                      >
                        <label className="cleanup__include">
                          <input
                            type="checkbox"
                            checked={item.include}
                            disabled={isOrganizing}
                            onChange={(e) => updateItem(item.currentPath, { include: e.target.checked })}
                          />
                        </label>
                        <div className="cleanup__file-info">
                          <span className="cleanup__file-name">{item.file.name}</span>
                          <span className="cleanup__file-target">→ {item.targetPath}</span>
                        </div>
                        <input
                          type="text"
                          className="cleanup__author-input"
                          value={item.author}
                          disabled={isOrganizing || !item.include}
                          onChange={(e) => updateItem(item.currentPath, { author: e.target.value })}
                        />
                        <span className={`cleanup__status cleanup__status--${status}`}>{status}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {organizeError && <p className="cleanup__error">{organizeError}</p>}
          {organizeDone && <p className="cleanup__success">Done — check the console below for any per-file errors.</p>}

          <button
            type="button"
            className="button button--primary cleanup__organize-button"
            disabled={isOrganizing || includedCount === 0}
            onClick={handleOrganize}
          >
            {isOrganizing ? "Organizing…" : `Organize ${includedCount} file(s) into ${includedGroupCount} folder(s)`}
          </button>
        </>
      )}
    </div>
  );
}
