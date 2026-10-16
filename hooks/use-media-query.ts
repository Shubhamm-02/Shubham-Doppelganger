"use client";

import { useCallback, useSyncExternalStore } from "react";

export const DESKTOP_QUERY = "(min-width: 48rem)";

function useMediaQuery(query: string, serverValue = false) {
  const subscribe = useCallback(
    (listener: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}

export function useIsDesktop() {
  return useMediaQuery(DESKTOP_QUERY, true);
}
