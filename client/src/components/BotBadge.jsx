import { Bot, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function BotBadge({ label = 'BOT', className = '' }) {
  return (
    <span
      title="Pre-loaded starter BOT account — add your own real student data to replace sample entries"
      className={`inline-flex items-center gap-1 rounded-md border border-amber-300/90 dark:border-amber-700/70 bg-amber-100/90 dark:bg-amber-950/70 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200 shrink-0 leading-none ${className}`}
    >
      <Bot size={10} className="shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function RealDataBanner({
  title = 'Help Keep NOTESX 100% Real',
  message = 'Entries marked BOT are pre-loaded starter examples. Contribute your own authentic student data so real peers take over every board!',
  ctaLabel,
  ctaTo,
  onAction,
  className = '',
}) {
  return (
    <div
      className={`rounded-2xl border border-emerald-200/90 dark:border-emerald-900/60 bg-gradient-to-r from-amber-50/90 via-white to-emerald-50/90 dark:from-amber-950/30 dark:via-slate-900 dark:to-emerald-950/30 px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${className}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-600 text-white shadow-2xs">
          <Sparkles size={14} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-slate-900 dark:text-white flex flex-wrap items-center gap-1.5">
            <span>{title}</span>
            <BotBadge label="BOT = Sample" />
          </p>
          <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-snug mt-0.5">
            {message}
          </p>
        </div>
      </div>

      {ctaLabel && (ctaTo || onAction) && (
        ctaTo ? (
          <Link
            to={ctaTo}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 text-xs font-bold transition shrink-0 shadow-xs"
          >
            <span>{ctaLabel}</span>
            <ArrowRight size={13} />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 text-xs font-bold transition shrink-0 shadow-xs cursor-pointer"
          >
            <span>{ctaLabel}</span>
            <ArrowRight size={13} />
          </button>
        )
      )}
    </div>
  );
}
