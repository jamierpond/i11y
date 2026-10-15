"use client";

import { RefObject, useEffect, useState } from "react";

// True once the element comes within `margin` of the viewport. Below-the-fold
// images wait for this, so they don't take bandwidth from the hero on first
// load (Chrome's native lazy-loading starts them early on slow connections).
export function useNearViewport(ref: RefObject<Element | null>, margin = "600px") {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true);
    }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, near]);
  return near;
}
