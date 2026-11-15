// Reference solution for Web-Bench react task-1 = Web-Bench's official reference implementation
// (projects/react/src, copied unchanged into ./ref except type-only import fixes). Upstream mounts it via
// src/index.tsx -> createRoot(<Router />); here the stack's App entry mounts the same <Router /> client-side
// (the upstream reference reads window.location / portals into document.body during render, so it is not SSR-safe).
import { useEffect, useState } from "react";
import type { ComponentType } from "react";

export default function App() {
  const [Router, setRouter] = useState<ComponentType | null>(null);
  useEffect(() => {
    let alive = true;
    import("./ref/router").then((m) => {
      if (alive) setRouter(() => m.default);
    });
    return () => {
      alive = false;
    };
  }, []);
  return Router ? <Router /> : null;
}
