"use client";

import Image from "next/image";
import { RefreshCw } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NAV_ITEMS, type Section } from "./nav";

interface AppSidebarProps {
  section: Section;
  onNavigate: (section: Section) => void;
  loading: boolean;
  onRefresh: () => void;
  dateRange: { start: string; end: string };
  alertCount: number;
}

const GROUP_ORDER = ["General", "Análisis", "Seguridad", "Sistema"];

export function AppSidebar({
  section,
  onNavigate,
  loading,
  onRefresh,
  dateRange,
  alertCount,
}: AppSidebarProps) {
  const groups = GROUP_ORDER
    .map((group) => [group, NAV_ITEMS.filter((i) => (i.group ?? "General") === group)] as const)
    .filter(([, items]) => items.length > 0);

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border">
      <SidebarHeader className="shrink-0 px-4 pb-4 pt-5">
        <div className="relative overflow-hidden rounded-xl bg-navy-raised p-4 ring-1 ring-inset ring-white/[0.06]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120px_64px_at_50%_-10%,rgba(45,212,191,0.22),transparent)]"
          />
          <div className="relative h-[5.75rem] w-full">
            <Image
              src="/pixel_civik.png"
              alt="Pixel Civik"
              fill
              sizes="160px"
              priority
              className="object-contain"
            />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map(([group, items]) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel className="text-sidebar-foreground/45">
              {group}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => {
                  const active = section === item.id;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        onClick={() => onNavigate(item.id)}
                        className="relative cursor-pointer transition-colors data-[active=true]:bg-white/10 data-[active=true]:font-semibold data-[active=true]:text-white"
                      >
                        {active && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand"
                          />
                        )}
                        <item.Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.id === "alertas" && alertCount > 0 && (
                        <SidebarMenuBadge className="bg-rose-500/90 text-white">
                          {alertCount}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Actualizar datos" onClick={onRefresh} className="cursor-pointer">
              <RefreshCw className={loading ? "animate-spin" : ""} />
              <span>Actualizar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-1 group-data-[collapsible=icon]:hidden">
          <div className="rounded-lg border border-sidebar-border bg-white/[0.03] px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
              Período
            </p>
            <p className="tnum mt-0.5 text-[11px] font-medium text-sidebar-foreground">
              {dateRange.start} → {dateRange.end}
            </p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
