"use client";

import { useCallback, useState } from "react";

import { Graph, type Equation } from "@/components/Graph";
import { EquationPanel } from "@/components/EquationPanel";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

import { useIsMobile } from "@/hooks/use-mobile";

export default function Home() {
  const [equations, setEquations] = useState<Equation[]>([
    { id: "1", expr: "sin(x) * x", color: "--plot-1", visible: true },
    { id: "2", expr: "x^2 / 5 - 3", color: "--plot-2", visible: true },
  ]);

  const handleError = useCallback((id: string, error: string | undefined) => {
    setEquations((prev) => {
      const cur = prev.find((e) => e.id === id);
      if (!cur) return prev;
      if (cur.error === error) return prev;
      return prev.map((e) => (e.id === id ? { ...e, error } : e));
    });
  }, []);

  const isMobile = useIsMobile();

  const graphPanel = (
    <div className="relative h-full w-full bg-background">
      <Graph equations={equations} onEquationError={handleError} />
    </div>
  );

  const eqPanel = (
    <div className="flex h-full w-full flex-col bg-card">
      <EquationPanel equations={equations} onChange={setEquations} />
    </div>
  );

  return (
    <main className="h-screen w-full bg-background text-foreground">
      {isMobile ? (
        <ResizablePanelGroup orientation="vertical" className="h-full w-full">
          <ResizablePanel defaultSize="45%" minSize="20%">
            {graphPanel}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="55%" minSize="20%">
            {eqPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
          <ResizablePanel defaultSize="25%" minSize="15%" maxSize="50%">
            {eqPanel}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="75%" minSize="40%">
            {graphPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </main>
  );
}
