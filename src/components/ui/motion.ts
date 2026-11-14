"use client";

import { flushSync } from "react-dom";

export function transitionScreen(update: () => void) {
  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}
