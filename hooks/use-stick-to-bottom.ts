"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_THRESHOLD = 80;

function distanceFromBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

export function useStickToBottom({ threshold = DEFAULT_THRESHOLD }: { threshold?: number } = {}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const smoothing = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const update = useCallback((atBottom: boolean) => {
    stuck.current = atBottom;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const element = scrollRef.current;
      if (!element) return;
      update(true);
      const smooth = behavior === "smooth" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      smoothing.current = smooth && distanceFromBottom(element) > threshold;
      element.scrollTo({ top: element.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    },
    [threshold, update]
  );

  useEffect(() => {
    const element = scrollRef.current;
    const content = contentRef.current;
    if (!element || !content) return;
    const scroller = element;

    function onScroll() {
      const atBottom = distanceFromBottom(scroller) <= threshold;
      if (smoothing.current) {
        if (atBottom) smoothing.current = false;
        return;
      }
      if (atBottom !== stuck.current) update(atBottom);
    }

    function onUserScrollIntent() {
      smoothing.current = false;
    }

    const observer = new ResizeObserver(() => {
      if (stuck.current && distanceFromBottom(scroller) > 1) scroller.scrollTop = scroller.scrollHeight;
    });

    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("wheel", onUserScrollIntent, { passive: true });
    scroller.addEventListener("touchstart", onUserScrollIntent, { passive: true });
    observer.observe(content);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onUserScrollIntent);
      scroller.removeEventListener("touchstart", onUserScrollIntent);
      observer.disconnect();
    };
  }, [threshold, update]);

  return { scrollRef, contentRef, isAtBottom, scrollToBottom };
}
