// useOfflineFirst.ts — VERSION FINALE CORRIGÉE
// Corrections:
//  ✅ useEffect([]) au lieu de ([load]) → plus de boucle infinie
//  ✅ Refs stables pour toutes les props → pas de stale closures
import { useEffect, useRef, useCallback, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { syncAll } from "./supabaseService";

interface UseOfflineFirstOptions<T> {
  cacheLoader: () => Promise<T | null>;
  serverLoader: () => Promise<T | null>;
  onData: (data: T) => void;
  fallback?: T;
}

export function useOfflineFirst<T>({
  cacheLoader, serverLoader, onData, fallback,
}: UseOfflineFirstOptions<T>) {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const wasOffline = useRef(false);
  const initialLoadDone = useRef(false);

  const onDataRef = useRef(onData);
  const serverLoaderRef = useRef(serverLoader);
  const cacheLoaderRef = useRef(cacheLoader);
  const fallbackRef = useRef(fallback);

  useEffect(() => { onDataRef.current = onData; }, [onData]);
  useEffect(() => { serverLoaderRef.current = serverLoader; }, [serverLoader]);
  useEffect(() => { cacheLoaderRef.current = cacheLoader; }, [cacheLoader]);
  useEffect(() => { fallbackRef.current = fallback; }, [fallback]);

  // ✅ load() stable — [] comme deps, utilise refs
  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const cached = await cacheLoaderRef.current();
      if (cached != null) onDataRef.current(cached);
      else if (fallbackRef.current !== undefined) onDataRef.current(fallbackRef.current!);
    } catch {
      if (fallbackRef.current !== undefined) onDataRef.current(fallbackRef.current!);
    }
    if (showSpinner) setLoading(false);
    try {
      const fresh = await serverLoaderRef.current();
      if (fresh != null) onDataRef.current(fresh);
    } catch {}
  }, []); // ✅ [] — jamais recréé

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }, [load]);

  // ✅ Load une seule fois au mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    load(false);
  }, []); // ✅ [] pas [load]

  // Retour wifi
  useEffect(() => {
    const unsub = NetInfo.addEventListener(async (state) => {
      const connected = state.isConnected && state.isInternetReachable !== false;
      if (!connected) { wasOffline.current = true; return; }
      if (wasOffline.current) {
        wasOffline.current = false;
        try { await syncAll(); await load(false); } catch {}
      }
    });
    return () => unsub();
  }, [load]);

  return { loading, refreshing, refresh, reload: load };
}
