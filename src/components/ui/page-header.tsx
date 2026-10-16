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
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-strong ring-1 ring-inset ring-brand/15 [&_svg]:size-[18px]">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            {title}
          </h1>
          {subtitle && <div className="mt-0.5 text-[13px] text-slate-500">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
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
    <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h3 className="truncate text-[13px] font-semibold text-slate-800">{title}</h3>
        {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
