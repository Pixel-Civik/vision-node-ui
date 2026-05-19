"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Defers rendering until the placeholder enters the viewport (+ 400px margin).
 * Prevents burst of ResizeObserver callbacks when many charts mount simultaneously.
 */
export function LazyChart({
  children,
  height = 220,
}: {
  children: React.ReactNode;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReady(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (ready) return <>{children}</>;
  return (
    <div ref={ref} style={{ height }} className="animate-pulse bg-slate-50 rounded-xl" />
  );
}
