"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { KPIResult } from "@/lib/types";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function KPICard({
  label,
  value,
  sub,
  help,
  trend,
}: {
  label: string;
  value: string;
  sub: string;
  help: string;
  trend?: "up" | "down" | "neutral";
}) {
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  return (
    <Card className="border border-gray-200 shadow-sm">
      <CardContent className="pt-5 pb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">{label}</p>
        <p className="text-3xl font-semibold text-gray-900">{value}</p>
        <div className="flex items-center gap-1 mt-1">
          <Icon size={13} className="text-gray-400" />
          <span className="text-xs text-gray-500">{sub}</span>
        </div>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">{help}</p>
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="border border-gray-200 shadow-sm animate-pulse">
      <CardContent className="pt-5 pb-4 space-y-2">
        <div className="h-3 bg-gray-200 rounded w-1/2" />
        <div className="h-8 bg-gray-200 rounded w-2/3" />
        <div className="h-3 bg-gray-200 rounded w-1/3" />
      </CardContent>
    </Card>
  );
}

export function KPICards({ kpis, loading }: { kpis: KPIResult | null; loading: boolean }) {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const d = Math.max(1, kpis.days);
  const exitRate = kpis.enters > 0 ? Math.round((kpis.exits / kpis.enters) * 1000) / 10 : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-4">
        <KPICard
          label="Entradas / día"
          value={(kpis.enters / d).toFixed(1)}
          sub={`Total: ${kpis.enters.toLocaleString()}`}
          help={`Promedio diario de ingresos al local en ${kpis.days} día(s).`}
          trend="neutral"
        />
        <KPICard
          label="Salidas / día"
          value={(kpis.exits / d).toFixed(1)}
          sub={`Total: ${kpis.exits.toLocaleString()}`}
          help={`Promedio diario de salidas del local en ${kpis.days} día(s).`}
          trend="neutral"
        />
        <KPICard
          label="Neto / día"
          value={(kpis.net / d).toFixed(1)}
          sub={`Total: ${kpis.net.toLocaleString()}`}
          help="Diferencia entre entradas y salidas. Neto alto indica salidas no capturadas."
          trend={kpis.net > 0 ? "up" : kpis.net < 0 ? "down" : "neutral"}
        />
      </div>
      <p className="text-xs text-gray-500">
        Período: <strong>{kpis.days}</strong> día(s) · Tasa de salida capturada:{" "}
        <strong>{exitRate}%</strong>
        {exitRate < 80 && (
          <span className="ml-2 text-amber-600 font-medium">
            ⚠ Tasa &lt; 80% — revisar sensores de salida
          </span>
        )}
      </p>
    </div>
  );
}
