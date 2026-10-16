"use client";

import type { ElementType, ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface SectionTabItem {
  value: string;
  label: string;
  icon?: ElementType;
  content: ReactNode;
}

interface SectionTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  tabs: SectionTabItem[];
  /** Badge/contador opcional por pestaña (clave = value de la pestaña) */
  badgeByValue?: Record<string, ReactNode>;
  className?: string;
}

/**
 * SectionTabs — sub-navegación superior reutilizable.
 * Divide cada apartado en sub-páginas (una pestaña por bloque) para que la
 * navegación sea más clara y ninguna vista acumule demasiada información.
 */
export function SectionTabs({
  value,
  onValueChange,
  tabs,
  badgeByValue,
  className,
}: SectionTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
      className={cn("gap-4", className)}
    >
      <TabsList className="h-auto! w-full flex-wrap justify-start gap-1 overflow-hidden rounded-2xl border border-border bg-muted/60 p-1.5 shadow-sm">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="h-9 flex-none cursor-pointer gap-2 whitespace-nowrap rounded-xl px-4 text-[13px] font-medium text-slate-500 transition-colors hover:bg-background hover:text-slate-800 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 data-active:bg-navy data-active:text-white data-active:shadow-sm"
          >
            {tab.icon && <tab.icon className="size-3.5" />}
            {tab.label}
            {badgeByValue?.[tab.value]}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-0">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
