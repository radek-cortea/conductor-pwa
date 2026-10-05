import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
export function useDocumentVisible() {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => false,
  );
}

export function useRowVisible() {
  const ref = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { root: row.closest('[aria-label="Workspace list"]'), rootMargin: "120px" },
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}
