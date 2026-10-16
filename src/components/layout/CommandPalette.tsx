"use client";

import { PanelLeft, RefreshCw } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useSidebar } from "@/components/ui/sidebar";
import { NAV_ITEMS, type Section } from "./nav";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (section: Section) => void;
  onRefresh: () => void;
}

export function CommandPalette({ open, onOpenChange, onNavigate, onRefresh }: CommandPaletteProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar secciones y acciones…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>

        <CommandGroup heading="Navegación">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.label} ${item.group ?? ""}`}
              onSelect={() => {
                onNavigate(item.id);
                onOpenChange(false);
              }}
            >
              <item.Icon />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Acciones">
          <CommandItem
            onSelect={() => {
              onRefresh();
              onOpenChange(false);
            }}
          >
            <RefreshCw />
            <span>Actualizar datos</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              toggleSidebar();
              onOpenChange(false);
            }}
          >
            <PanelLeft />
            <span>Alternar barra lateral</span>
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
