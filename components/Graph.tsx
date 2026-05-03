import { useEffect, useRef, useState, useCallback } from "react";
import { compile, type EvalFunction } from "mathjs";

export interface Equation {
  id: string;
  expr: string;
  color: string;
  visible: boolean;
  error?: string;
}

interface ViewBox {
  cx: number;
  cy: number;
  scale: number; // pixels per unit
}

interface GraphProps {
  equations: Equation[];
  onEquationError: (id: string, error: string | undefined) => void;
}

interface CursorInfo {
  x: number;
  y: number;
  values: { id: string; color: string; expr: string; y: number }[];
}

type ParsedEq =
  | { kind: "explicit"; body: string }
  | { kind: "implicit"; body: string };

function parseEquation(raw: string): ParsedEq | null {
  const expr = raw.trim();
  if (!expr) return null;
  // Has explicit "=" — convert lhs = rhs to (lhs) - (rhs)
  if (expr.includes("=")) {
    const parts = expr.split("=");
    if (parts.length !== 2) return null;
    const [lhs, rhs] = parts.map((s) => s.trim());
    if (!lhs || !rhs) return null;
    // y = f(x) shortcut (explicit)
    if (/^y$/i.test(lhs) && !/\by\b/.test(rhs)) {
      return { kind: "explicit", body: rhs };
    }
    if (/^x$/i.test(rhs) && !/\bx\b/.test(lhs)) {
      // x = f(y) — treat as implicit
      return { kind: "implicit", body: `(${lhs})-(${rhs})` };
    }
    return { kind: "implicit", body: `(${lhs})-(${rhs})` };
  }
  // No "=" — if expression mentions y, treat as implicit f(x,y)=0
  if (/\by\b/.test(expr)) {
    return { kind: "implicit", body: expr };
  }
  return { kind: "explicit", body: expr };
}

export function Graph({ equations, onEquationError }: GraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<ViewBox>({ cx: 0, cy: 0, scale: 60 });
  const [cursor, setCursor] = useState<CursorInfo | null>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; cx: number; cy: number; scale: number; midX: number; midY: number } | null>(null);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setSize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const toScreen = useCallback(
    (x: number, y: number) => ({
      sx: size.w / 2 + (x - view.cx) * view.scale,
      sy: size.h / 2 - (y - view.cy) * view.scale,
    }),
    [size, view],
  );

  const toWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - size.w / 2) / view.scale + view.cx,
      y: -(sy - size.h / 2) / view.scale + view.cy,
    }),
    [size, view],
  );

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.w, size.h);

    const styles = getComputedStyle(document.documentElement);
    const colorGrid = styles.getPropertyValue("--grid").trim();
    const colorGridStrong = styles.getPropertyValue("--grid-strong").trim();
    const colorAxis = styles.getPropertyValue("--axis").trim();
    const colorMuted = styles.getPropertyValue("--muted-foreground").trim();

    // Choose grid step (nice number)
    const targetPx = 70;
    const rawStep = targetPx / view.scale;
    const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / pow;
    const niceMul = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
    const step = niceMul * pow;
    const minor = step / 5;

    const tl = toWorld(0, 0);
    const br = toWorld(size.w, size.h);

    // Minor grid
    ctx.strokeStyle = colorGrid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const xMinStart = Math.floor(tl.x / minor) * minor;
    for (let x = xMinStart; x <= br.x; x += minor) {
      const { sx } = toScreen(x, 0);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, size.h);
    }
    const yMinStart = Math.floor(br.y / minor) * minor;
    for (let y = yMinStart; y <= tl.y; y += minor) {
      const { sy } = toScreen(0, y);
      ctx.moveTo(0, sy);
      ctx.lineTo(size.w, sy);
    }
    ctx.stroke();

    // Major grid
    ctx.strokeStyle = colorGridStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const xStart = Math.floor(tl.x / step) * step;
    for (let x = xStart; x <= br.x; x += step) {
      const { sx } = toScreen(x, 0);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, size.h);
    }
    const yStart = Math.floor(br.y / step) * step;
    for (let y = yStart; y <= tl.y; y += step) {
      const { sy } = toScreen(0, y);
      ctx.moveTo(0, sy);
      ctx.lineTo(size.w, sy);
    }
    ctx.stroke();

    // Axes
    ctx.strokeStyle = colorAxis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const origin = toScreen(0, 0);
    if (origin.sy >= 0 && origin.sy <= size.h) {
      ctx.moveTo(0, origin.sy);
      ctx.lineTo(size.w, origin.sy);
    }
    if (origin.sx >= 0 && origin.sx <= size.w) {
      ctx.moveTo(origin.sx, 0);
      ctx.lineTo(origin.sx, size.h);
    }
    ctx.stroke();

    // Labels
    ctx.fillStyle = colorMuted;
    ctx.font = "11px JetBrains Mono, monospace";
    const fmt = (n: number) => {
      if (Math.abs(n) < 1e-10) return "0";
      if (Math.abs(n) >= 10000 || Math.abs(n) < 0.001) return n.toExponential(1);
      return parseFloat(n.toPrecision(6)).toString();
    };
    for (let x = xStart; x <= br.x; x += step) {
      if (Math.abs(x) < 1e-10) continue;
      const { sx } = toScreen(x, 0);
      const ly = Math.min(Math.max(origin.sy + 14, 14), size.h - 4);
      ctx.fillText(fmt(x), sx + 3, ly);
    }
    for (let y = yStart; y <= tl.y; y += step) {
      if (Math.abs(y) < 1e-10) continue;
      const { sy } = toScreen(0, y);
      const lx = Math.min(Math.max(origin.sx + 4, 4), size.w - 40);
      ctx.fillText(fmt(y), lx, sy - 3);
    }

    // Plot equations
    for (const eq of equations) {
      if (!eq.visible || !eq.expr.trim()) continue;
      const parsed = parseEquation(eq.expr);
      if (!parsed) {
        onEquationError(eq.id, "Invalid expression");
        continue;
      }

      let fn: EvalFunction;
      try {
        fn = compile(parsed.body);
        // probe
        if (parsed.kind === "explicit") fn.evaluate({ x: 0 });
        else fn.evaluate({ x: 0, y: 0 });
        onEquationError(eq.id, undefined);
      } catch (err) {
        onEquationError(eq.id, (err as Error).message);
        continue;
      }

      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue(eq.color).trim();
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      if (parsed.kind === "explicit") {
        ctx.beginPath();
        let prevValid = false;
        let prevY = 0;
        const pxStep = 1;
        for (let sx = 0; sx <= size.w; sx += pxStep) {
          const x = (sx - size.w / 2) / view.scale + view.cx;
          let y: number;
          try {
            y = fn.evaluate({ x });
          } catch {
            prevValid = false;
            continue;
          }
          if (typeof y !== "number" || !isFinite(y)) {
            prevValid = false;
            continue;
          }
          const sy = size.h / 2 - (y - view.cy) * view.scale;
          if (prevValid) {
            const jump = Math.abs(y - prevY) * view.scale;
            if (jump > size.h * 2) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          } else {
            ctx.moveTo(sx, sy);
          }
          prevValid = true;
          prevY = y;
        }
        ctx.stroke();
      } else {
        // Implicit: marching squares on f(x,y) = 0
        const cell = 6; // px
        const cols = Math.ceil(size.w / cell) + 1;
        const rows = Math.ceil(size.h / cell) + 1;
        const grid = new Float32Array(cols * rows);
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const sx = i * cell;
            const sy = j * cell;
            const x = (sx - size.w / 2) / view.scale + view.cx;
            const y = -(sy - size.h / 2) / view.scale + view.cy;
            let v: number;
            try {
              v = fn.evaluate({ x, y }) as number;
            } catch {
              v = NaN;
            }
            grid[j * cols + i] = typeof v === "number" && isFinite(v) ? v : NaN;
          }
        }
        ctx.beginPath();
        const interp = (a: number, b: number) => a / (a - b);
        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols - 1; i++) {
            const v0 = grid[j * cols + i];
            const v1 = grid[j * cols + i + 1];
            const v2 = grid[(j + 1) * cols + i + 1];
            const v3 = grid[(j + 1) * cols + i];
            if (!isFinite(v0) || !isFinite(v1) || !isFinite(v2) || !isFinite(v3)) continue;
            // Skip cells with extreme magnitude jumps (likely asymptote)
            const mx = Math.max(Math.abs(v0), Math.abs(v1), Math.abs(v2), Math.abs(v3));
            const mn = Math.min(Math.abs(v0), Math.abs(v1), Math.abs(v2), Math.abs(v3));
            if (mx > 1e6 && mn < mx * 0.01) continue;

            let idx = 0;
            if (v0 > 0) idx |= 1;
            if (v1 > 0) idx |= 2;
            if (v2 > 0) idx |= 4;
            if (v3 > 0) idx |= 8;
            if (idx === 0 || idx === 15) continue;

            const x0 = i * cell, x1 = (i + 1) * cell;
            const y0 = j * cell, y1 = (j + 1) * cell;
            // Edge points
            const eTop = () => ({ x: x0 + interp(v0, v1) * cell, y: y0 });
            const eRight = () => ({ x: x1, y: y0 + interp(v1, v2) * cell });
            const eBottom = () => ({ x: x0 + interp(v3, v2) * cell, y: y1 });
            const eLeft = () => ({ x: x0, y: y0 + interp(v0, v3) * cell });

            const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
            };
            switch (idx) {
              case 1: case 14: seg(eLeft(), eTop()); break;
              case 2: case 13: seg(eTop(), eRight()); break;
              case 3: case 12: seg(eLeft(), eRight()); break;
              case 4: case 11: seg(eRight(), eBottom()); break;
              case 5: seg(eLeft(), eTop()); seg(eRight(), eBottom()); break;
              case 6: case 9: seg(eTop(), eBottom()); break;
              case 7: case 8: seg(eLeft(), eBottom()); break;
              case 10: seg(eTop(), eRight()); seg(eLeft(), eBottom()); break;
            }
          }
        }
        ctx.stroke();
      }
    }

    // Cursor crosshair
    if (cursor) {
      const { sx, sy } = toScreen(cursor.x, cursor.y);
      ctx.strokeStyle = colorAxis;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, size.h);
      ctx.moveTo(0, sy);
      ctx.lineTo(size.w, sy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Plot points
      for (const v of cursor.values) {
        if (!isFinite(v.y)) continue;
        const p = toScreen(cursor.x, v.y);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(v.color).trim();
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [equations, view, size, cursor, toScreen, toWorld, onEquationError]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = toWorld(mx, my);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.max(2, Math.min(5000, view.scale * factor));
    // keep mouse anchored
    const newCx = before.x - (mx - size.w / 2) / newScale;
    const newCy = before.y + (my - size.h / 2) / newScale;
    setView({ cx: newCx, cy: newCy, scale: newScale });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      setView({
        ...view,
        cx: dragRef.current.cx - dx / view.scale,
        cy: dragRef.current.cy + dy / view.scale,
      });
      return;
    }

    const w = toWorld(mx, my);
    const values = equations
      .filter((eq) => eq.visible && eq.expr.trim())
      .map((eq) => {
        const parsed = parseEquation(eq.expr);
        if (!parsed || parsed.kind !== "explicit") {
          return { id: eq.id, color: eq.color, expr: eq.expr, y: NaN };
        }
        try {
          const y = compile(parsed.body).evaluate({ x: w.x }) as number;
          return { id: eq.id, color: eq.color, expr: eq.expr, y };
        } catch {
          return { id: eq.id, color: eq.color, expr: eq.expr, y: NaN };
        }
      });
    setCursor({ x: w.x, y: w.y, values });
  };

  const handleMouseUp = () => {
    dragRef.current = null;
  };

  const handleMouseLeave = () => {
    dragRef.current = null;
    setCursor(null);
  };

  // Touch handlers — attach non-passively so we can preventDefault to stop page scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        const t = e.touches[0];
        dragRef.current = { x: t.clientX, y: t.clientY, cx: view.cx, cy: view.cy };
        pinchRef.current = null;
      } else if (e.touches.length === 2) {
        e.preventDefault();
        const [a, b] = [e.touches[0], e.touches[1]];
        const rect = canvas.getBoundingClientRect();
        const dx = a.clientX - b.clientX;
        const dy = a.clientY - b.clientY;
        const dist = Math.hypot(dx, dy);
        const midX = (a.clientX + b.clientX) / 2 - rect.left;
        const midY = (a.clientY + b.clientY) / 2 - rect.top;
        pinchRef.current = { dist, cx: view.cx, cy: view.cy, scale: view.scale, midX, midY };
        dragRef.current = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && dragRef.current) {
        e.preventDefault();
        const t = e.touches[0];
        const d = dragRef.current;
        const dx = t.clientX - d.x;
        const dy = t.clientY - d.y;
        setView((v) => ({
          ...v,
          cx: d.cx - dx / v.scale,
          cy: d.cy + dy / v.scale,
        }));
      } else if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const [a, b] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const factor = dist / pinchRef.current.dist;
        const newScale = Math.max(2, Math.min(5000, pinchRef.current.scale * factor));
        const { midX, midY, cx, cy, scale } = pinchRef.current;
        // anchor zoom around pinch midpoint
        const beforeX = (midX - size.w / 2) / scale + cx;
        const beforeY = -(midY - size.h / 2) / scale + cy;
        const newCx = beforeX - (midX - size.w / 2) / newScale;
        const newCy = beforeY + (midY - size.h / 2) / newScale;
        setView({ cx: newCx, cy: newCy, scale: newScale });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        dragRef.current = null;
        pinchRef.current = null;
        setCursor(null);
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        dragRef.current = { x: t.clientX, y: t.clientY, cx: view.cx, cy: view.cy };
        pinchRef.current = null;
      }
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [view, size]);

  const reset = () => setView({ cx: 0, cy: 0, scale: 60 });
  const zoom = (factor: number) => setView((v) => ({ ...v, scale: Math.max(2, Math.min(5000, v.scale * factor)) }));

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, cursor: dragRef.current ? "grabbing" : "crosshair", touchAction: "none" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />

      {/* Coordinate readout */}
      {cursor && (
        <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-border bg-card/80 px-3 py-2 font-mono text-xs backdrop-blur">
          <div className="text-muted-foreground">
            x = <span className="text-foreground">{cursor.x.toFixed(4)}</span>
          </div>
          <div className="text-muted-foreground">
            y = <span className="text-foreground">{cursor.y.toFixed(4)}</span>
          </div>
          {cursor.values.length > 0 && (
            <div className="mt-2 space-y-0.5 border-t border-border pt-2">
              {cursor.values.map((v) => (
                <div key={v.id} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: `var(${v.color})` }}
                  />
                  <span className="text-foreground">f({cursor.x.toFixed(2)}) = {isFinite(v.y) ? v.y.toFixed(4) : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 rounded-md border border-border bg-card/80 p-1 backdrop-blur">
        <button onClick={() => zoom(1.4)} className="h-8 w-8 rounded font-mono text-sm text-foreground hover:bg-secondary">+</button>
        <button onClick={() => zoom(1 / 1.4)} className="h-8 w-8 rounded font-mono text-sm text-foreground hover:bg-secondary">−</button>
        <button onClick={reset} className="h-8 w-8 rounded font-mono text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground" title="Reset view">⌂</button>
      </div>

      {/* Scale indicator */}
      <div className="pointer-events-none absolute bottom-4 left-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        scale · {view.scale.toFixed(0)}px/unit
      </div>
    </div>
  );
}