import { useCallback, useState } from "react";

export interface OpdsCatalog {
  id: string;
  name: string;
  url: string;
  username: string;
  /** Stored in plain text in localStorage, same as everything else CrossSwap persists client-side. */
  password: string;
}

const STORAGE_KEY = "crossswap:opds-catalogs";

function loadCatalogs(): OpdsCatalog[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCatalogs(catalogs: OpdsCatalog[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(catalogs));
  } catch {
    // Storage unavailable; catalogs just won't persist across reloads.
  }
}

export interface UseOpdsCatalogsApi {
  catalogs: OpdsCatalog[];
  addCatalog: (catalog: Omit<OpdsCatalog, "id">) => OpdsCatalog;
  removeCatalog: (id: string) => void;
}

export function useOpdsCatalogs(): UseOpdsCatalogsApi {
  const [catalogs, setCatalogs] = useState<OpdsCatalog[]>(() => loadCatalogs());

  const addCatalog = useCallback((catalog: Omit<OpdsCatalog, "id">) => {
    const entry: OpdsCatalog = { ...catalog, id: crypto.randomUUID() };
    setCatalogs((prev) => {
      const next = [...prev, entry];
      saveCatalogs(next);
      return next;
    });
    return entry;
  }, []);

  const removeCatalog = useCallback((id: string) => {
    setCatalogs((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveCatalogs(next);
      return next;
    });
  }, []);

  return { catalogs, addCatalog, removeCatalog };
}
