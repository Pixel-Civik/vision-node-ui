"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { TIZKpiRow } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="border border-gray-200">
      <CardContent className="pt-4 pb-3">
        <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-semibold text-gray-800 mt-1">{value}</p>
        <p className="text-xs text-gray-400">{sub}</p>
      </CardContent>
    </Card>
  );
}

export function TIZPanel({ rows, loading }: { rows: TIZKpiRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className="text-sm text-gray-400 py-8 text-center">
        Sin datos de tiempo en zona para el período seleccionado.
      </p>
    );
  }

  const total = rows.reduce((s, r) => s + r.count, 0);
  const avgAll = rows.reduce((s, r) => s + r.avg_s * r.count, 0) / Math.max(1, total);
  const medianTop = rows.slice().sort((a, b) => b.count - a.count)[0];

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Tiempo de permanencia en zonas configuradas (evento <code>visit</code>).
        Mediana es el tiempo del visitante típico; P90 es el caso más largo frecuente.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Total registros"
          value={total.toLocaleString()}
          sub={`en ${rows.length} zona(s)`}
        />
        <StatCard
          label="Promedio global"
          value={`${avgAll.toFixed(1)}s`}
          sub={`${(avgAll / 60).toFixed(2)} min`}
        />
        <StatCard
          label="Zona principal"
          value={medianTop?.zone ?? "—"}
          sub={`${medianTop?.count ?? 0} visitas`}
        />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Mediana por zona (segundos)</p>
        <ResponsiveContainer width="100%" height={Math.max(100, rows.length * 36)}>
          <BarChart layout="vertical" data={rows} margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="zone" tick={{ fontSize: 10 }} width={120} />
            <Tooltip
              formatter={(v, name) => [
                name === "median_s" ? `${v}s` : name === "p90_s" ? `${v}s` : v,
                name === "median_s" ? "Mediana" : name === "p90_s" ? "P90" : "Registros",
              ]}
            />
            <Bar dataKey="median_s" name="median_s" fill="#7C3AED" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
