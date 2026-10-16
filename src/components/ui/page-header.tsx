import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}

/**
 * PageHeader — encabezado de sección consistente (título + subtítulo + acciones).
 * Unifica el ritmo visual entre todas las vistas de la aplicación.
 */
export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand-strong ring-1 ring-inset ring-brand/20">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

interface PanelTitleProps {
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
}

/**
 * PanelTitle — encabezado interno de una tarjeta/gráfico.
 * Mantiene el mismo ritmo (título fuerte + pista tenue) en todo el dashboard.
 */
export function PanelTitle({ title, hint, actions }: PanelTitleProps) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
