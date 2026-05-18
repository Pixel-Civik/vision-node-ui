"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { ZoneBreakdownRow, ChannelBreakdownRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS: Record<string, string> = {
  enter: "#10B981",
  exit: "#EF4444",
  pasante: "#6B7280",
  visitor: "#3B82F6",
  visit: "#7C3AED",
};

function HBar({ data, label }: { data: { name: string; value: number; type: string }[]; label: string }) {
  if (!data.length) return <p className="text-xs text-gray-400 py-4 text-center">Sin datos</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 28)}>
      <BarChart layout="vertical" data={data} margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
        <Tooltip formatter={(v, _, p) => [v, p.payload.type]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={COLORS[d.type] ?? "#94A3B8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ZonePanel({
  zones,
  channels,
  loading,
}: {
  zones: ZoneBreakdownRow[];
  channels: ChannelBreakdownRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  const zoneData = zones
    .filter((r) => ["enter", "exit"].includes(r.event_type))
    .map((r) => ({ name: r.zone, value: r.count, type: r.event_type }));

  const channelData = channels
    .filter((r) => ["enter", "exit"].includes(r.event_type))
    .map((r) => ({ name: r.channel, value: r.count, type: r.event_type }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-gray-700">Por zona</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          {zoneData.length ? (
            <HBar data={zoneData} label="Zona" />
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">Sin datos por zona</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-gray-700">Por cámara</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          {channelData.length ? (
            <HBar data={channelData} label="Cámara" />
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">Sin datos por cámara</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
