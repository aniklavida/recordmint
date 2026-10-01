"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light" || current === "dark") {
      setTheme(current);
    } else {
      const isMedia = window.location.pathname.startsWith("/v/") || window.location.pathname.startsWith("/record");
      if (isMedia) {
        setTheme("dark");
      } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
        setTheme("light");
      } else {
        setTheme("dark");
      }
    }
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("recordmint-theme", next);
    } catch {
      // Ignore storage errors in private browsing
    }
  };

  if (!mounted) {
    return (
      <button
        type="button"
        className="theme-toggle"
        aria-label="Toggle visual theme"
        title="Toggle visual theme"
      >
        <span className="theme-toggle-icon" aria-hidden="true" />
      </button>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      className="theme-toggle"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? (
        <Sun className="theme-toggle-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Moon className="theme-toggle-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
      )}
      <span className="theme-toggle-label">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
