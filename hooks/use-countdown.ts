"use client";

import { useEffect, useState } from "react";

function secondsUntil(until: number | null) {
  return until === null ? 0 : Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export function useSecondsUntil(until: number | null) {
  const [tick, setTick] = useState({ until, seconds: 0 });

  useEffect(() => {
    if (until === null) return;
    function update() {
      const seconds = secondsUntil(until);
      setTick({ until, seconds });
      if (seconds === 0) window.clearInterval(interval);
    }
    const interval = window.setInterval(update, 1000);
    const frame = window.requestAnimationFrame(update);
    return () => {
      window.clearInterval(interval);
      window.cancelAnimationFrame(frame);
    };
  }, [until]);

  return tick.until === until ? tick.seconds : secondsUntil(until);
}
