"use client";

import { RefreshCw } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { NAV_ITEMS, type Section } from "./nav";

interface AppTopbarProps {
  section: Section;
  onRefresh: () => void;
  refreshing: boolean;
}

export function AppTopbar({ section, onRefresh, refreshing }: AppTopbarProps) {
  const item = NAV_ITEMS.find((i) => i.id === section);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur-md sm:px-4">
      <SidebarTrigger className="-ml-1 shrink-0" />
      <Separator orientation="vertical" className="mr-1 h-5 shrink-0" />

      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden text-[11px] font-medium uppercase tracking-wider text-slate-400 sm:inline">
          {item?.group ?? "General"}
        </span>
        <span className="hidden text-slate-300 sm:inline">/</span>
        <span className="truncate text-sm font-semibold text-slate-800">
          {item?.label ?? "Panel"}
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="shrink-0 cursor-pointer gap-1.5 whitespace-nowrap"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Actualizar</span>
        </Button>
      </div>
    </header>
  );
}
