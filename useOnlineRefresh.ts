// useOnlineRefresh.ts — VERSION FINALE
import { useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { syncAll } from "./supabaseService";

export function useOnlineRefresh(reload: () => Promise<void> | void) {
  const wasOffline = useRef(false);
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(async (state) => {
      const connected = state.isConnected && state.isInternetReachable !== false;
      if (!connected) { wasOffline.current = true; return; }
      if (wasOffline.current) {
        wasOffline.current = false;
        try { await syncAll(); await reloadRef.current(); } catch {}
      }
    });
    return () => unsub();
  }, []);
}
