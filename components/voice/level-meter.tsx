"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { cx } from "@/lib/client/cx";

const BAR_COUNT = 32;
const SAMPLE_INTERVAL = 70;
const MIN_SCALE = 0.08;
const ACTIVE_THRESHOLD = 0.06;

export type LevelMeterProps = {
  subscribe(listener: (level: number) => void): () => void;
  active: boolean;
  className?: string;
};

export function LevelMeter({ subscribe, active, className }: LevelMeterProps) {
  const reduceMotion = useReducedMotion();
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = barsRef.current;
    if (!container) return;
    const bars = Array.from(container.children) as HTMLElement[];
    const samples = new Array<number>(BAR_COUNT).fill(0);
    let target = 0;
    let level = 0;
    let lastSample = 0;
    let frame = 0;

    const unsubscribe = subscribe((value) => {
      target = Math.min(1, Math.max(0, value));
    });

    if (reduceMotion) {
      let lit = false;
      const interval = window.setInterval(() => {
        const next = target > ACTIVE_THRESHOLD;
        if (next === lit) return;
        lit = next;
        container.dataset.lit = next ? "true" : "false";
      }, 250);
      return () => {
        unsubscribe();
        window.clearInterval(interval);
      };
    }

    function tick(time: number) {
      level += (target - level) * (target > level ? 0.45 : 0.12);
      if (time - lastSample >= SAMPLE_INTERVAL) {
        lastSample = time;
        samples.shift();
        samples.push(level);
        bars.forEach((bar, index) => {
          const distance = Math.abs(index - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 2);
          const envelope = 1 - distance * distance * 0.55;
          const scale = Math.max(MIN_SCALE, Math.sqrt(samples[index]) * envelope);
          bar.style.transform = `scaleY(${scale.toFixed(3)})`;
        });
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [subscribe, reduceMotion]);

  return (
    <div
      ref={barsRef}
      aria-hidden="true"
      data-lit="false"
      className={cx(
        "group flex h-8 items-center justify-between gap-0.5 transition-opacity duration-(--duration-slow) ease-out",
        active ? "opacity-100" : "opacity-40",
        className
      )}
    >
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <span
          key={index}
          className={cx(
            "h-full w-0.5 origin-center rounded-full bg-fg-muted [transform:scaleY(0.08)]",
            "transition-transform duration-75 ease-linear will-change-transform",
            "motion-reduce:[transform:scaleY(0.25)] motion-reduce:opacity-50 motion-reduce:transition-opacity motion-reduce:duration-(--duration-slow) motion-reduce:group-data-[lit=true]:opacity-100"
          )}
        />
      ))}
    </div>
  );
}
