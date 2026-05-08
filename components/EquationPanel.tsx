import { Eye, EyeOff, Plus, X } from "lucide-react";
import { useState } from "react";
import type { Equation } from "./Graph";
import { TooltipProvider, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface Props {
  equations: Equation[];
  onChange: (eqs: Equation[]) => void;
}

export const PALETTE = [
  "--plot-1",
  "--plot-2",
  "--plot-3",
  "--plot-4",
  "--plot-5",
  "--plot-6",
  "--plot-7",
  "--plot-8",
];

export function pickRandomColor(used: string[]): string {
  const available = PALETTE.filter((c) => !used.includes(c));
  const pool = available.length > 0 ? available : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function EquationPanel({ equations, onChange }: Props) {
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const update = (id: string, patch: Partial<Equation>) =>
    onChange(equations.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const remove = (id: string) => onChange(equations.filter((e) => e.id !== id));

  const add = () => {
    const color = pickRandomColor(equations.map((e) => e.color));
    onChange([
      ...equations,
      { id: crypto.randomUUID(), expr: "", color, visible: true },
    ]);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Plottable
        </div>
        <h1 className="mt-1 font-sans text-xl font-semibold tracking-tight">
          Graphing Calculator
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {equations.map((eq, i) => (
          <div
            key={eq.id}
            className="group relative border-b border-border px-5 py-4 transition-colors hover:bg-secondary/30"
          >
            <div className="flex items-start gap-3">
              <div className="relative flex flex-col items-center gap-2 pt-1">
                <button
                  onClick={() =>
                    setOpenPicker(openPicker === eq.id ? null : eq.id)
                  }
                  className="h-3 w-3 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-card transition-transform hover:scale-125"
                  style={{
                    backgroundColor: `var(${eq.color})`,
                    // @ts-expect-error css var
                    "--tw-ring-color": `var(${eq.color})`,
                  }}
                  title="Change color"
                  aria-label="Change color"
                />
                <span className="font-mono text-[9px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>

                {openPicker === eq.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setOpenPicker(null)}
                    />
                    <div className="absolute left-7 top-0 z-20 flex w-[136px] flex-wrap gap-2 rounded-md border border-border bg-popover p-2.5 shadow-xl">
                      {PALETTE.map((c) => (
                        <button
                          key={c}
                          onClick={(e) => {
                            e.stopPropagation();
                            update(eq.id, { color: c });
                            setOpenPicker(null);
                          }}
                          className={`h-6 w-6 shrink-0 rounded-full ring-offset-2 ring-offset-popover transition-transform hover:scale-110 ${
                            eq.color === c ? "ring-2 ring-foreground" : ""
                          }`}
                          style={{ backgroundColor: `var(${c})` }}
                          aria-label={`Color ${c}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-1 font-mono text-sm text-muted-foreground">
                  <span className="select-none">y =</span>
                  <input
                    autoFocus={i === equations.length - 1 && !eq.expr}
                    value={eq.expr.replace(/^\s*y\s*=\s*/i, "")}
                    onChange={(e) => update(eq.id, { expr: e.target.value })}
                    placeholder="sin(x) * x"
                    spellCheck={false}
                    className="w-full bg-transparent font-mono text-base text-foreground outline-none placeholder:text-muted-foreground/50"
                  />
                </div>
                {eq.error && (
                  <div className="font-mono text-[11px] text-destructive">
                    {eq.error}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                <TooltipProvider>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => update(eq.id, { visible: !eq.visible })}
                      className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      title={eq.visible ? "Hide" : "Show"}
                    >
                      {eq.visible ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Hide from graph</p>
                  </TooltipContent>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => remove(eq.id)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Remove from graph</p>
                  </TooltipContent>
                </TooltipProvider>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={add}
          className="flex w-full items-center gap-3 px-5 py-4 text-left font-mono text-sm text-muted-foreground transition-colors hover:bg-secondary/30 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          add equation
        </button>
      </div>

      <div className="border-t border-border px-5 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Syntax
        </div>
        <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
          <div>
            <span className="text-foreground">sin(x)</span> cos tan log sqrt
          </div>
          <div>
            <span className="text-foreground">x^2</span> ·{" "}
            <span className="text-foreground">2x</span> ·{" "}
            <span className="text-foreground">pi</span> ·{" "}
            <span className="text-foreground">e</span>
          </div>
          <div>
            <span className="text-foreground">abs(x)</span> ·{" "}
            <span className="text-foreground">exp(x)</span> ·{" "}
            <span className="text-foreground">x!</span>
          </div>
          <div className="pt-1 text-foreground">shapes</div>
          <div>
            <span className="text-foreground">x^2 + y^2 = 9</span> circle
          </div>
          <div>
            <span className="text-foreground">x^2/4 + y^2 = 1</span> ellipse
          </div>
          <div className="pt-1 text-[10px] opacity-70">
            tip: use y to plot implicit shapes
          </div>
        </div>
      </div>
    </div>
  );
}
