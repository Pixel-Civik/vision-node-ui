/**
 * nav.ts — Navigation configuration (single source of truth).
 * OCP: add new sections here without touching any component.
 */
import { LayoutDashboard, FileBarChart2, LogIn, Users, Clock } from "lucide-react";
import type { ElementType } from "react";

export type Section = "inicio" | "reporte" | "entradas" | "visitantes" | "tiz";

export interface NavItem {
  id: Section;
  label: string;
  Icon: ElementType;
  /** Optional group label shown as a separator above the item */
  group?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "inicio",     label: "Inicio",            Icon: LayoutDashboard },
  { id: "reporte",    label: "Reporte General",    Icon: FileBarChart2 },
  { id: "entradas",   label: "Entradas y Salidas", Icon: LogIn,  group: "Análisis" },
  { id: "visitantes", label: "Visitantes",         Icon: Users,  group: "Análisis" },
  { id: "tiz",        label: "Tiempo en Zona",     Icon: Clock,  group: "Análisis" },
];
