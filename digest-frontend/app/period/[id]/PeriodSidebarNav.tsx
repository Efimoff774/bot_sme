"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type NavItem = {
  id: number;
  name: string;
  avatarUrl: string | null;
};

export default function PeriodSidebarNav({ items }: { items: NavItem[] }) {
  const [activeId, setActiveId] = useState<number | null>(items[0]?.id ?? null);
  const [isUserNavigating, setIsUserNavigating] = useState(false);
  const navTimeoutRef = useRef<number | null>(null);

  const ids = useMemo(() => items.map((item) => item.id), [items]);

  useEffect(() => {
    if (ids.length === 0) return;

    const headings = ids
      .map((id) => document.getElementById(`participant-title-${id}`))
      .filter((node): node is HTMLElement => node != null);

    if (headings.length === 0) return;

    let rafId: number | null = null;

    const updateActiveByScroll = () => {
      if (isUserNavigating) return;
      const triggerLine = window.innerHeight * 0.18;
      let selectedId = ids[0];

      headings.forEach((heading) => {
        const top = heading.getBoundingClientRect().top;
        if (top <= triggerLine) {
          const idStr = heading.id.replace("participant-title-", "");
          const parsed = Number(idStr);
          if (!Number.isNaN(parsed)) selectedId = parsed;
        }
      });

      setActiveId((current) => (current === selectedId ? current : selectedId));
    };

    const onScrollOrResize = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        updateActiveByScroll();
        rafId = null;
      });
    };

    updateActiveByScroll();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [ids, isUserNavigating]);

  useEffect(() => {
    return () => {
      if (navTimeoutRef.current !== null) {
        window.clearTimeout(navTimeoutRef.current);
      }
    };
  }, []);

  return (
    <ul className="period-people-list">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={`period-person-card${activeId === item.id ? " is-active" : ""}`}
            onClick={() => {
              const target = document.getElementById(`participant-title-${item.id}`);
              if (target) {
                setIsUserNavigating(true);
                target.scrollIntoView({ behavior: "smooth", block: "start" });
                setActiveId(item.id);
                if (navTimeoutRef.current !== null) {
                  window.clearTimeout(navTimeoutRef.current);
                }
                navTimeoutRef.current = window.setTimeout(() => {
                  setIsUserNavigating(false);
                  navTimeoutRef.current = null;
                }, 650);
              }
            }}
          >
            {item.avatarUrl ? (
              <img src={item.avatarUrl} alt={item.name} className="period-person-avatar" />
            ) : (
              <div className="period-person-avatar fallback-avatar">?</div>
            )}
            <span>{item.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
