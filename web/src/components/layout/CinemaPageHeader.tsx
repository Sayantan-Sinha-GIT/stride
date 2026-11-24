import React from 'react';
import { Sparkle } from '@phosphor-icons/react/dist/ssr';

interface CinemaPageHeaderProps {
  index?: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function CinemaPageHeader({
  index = '01',
  eyebrow,
  title,
  subtitle,
  action,
}: CinemaPageHeaderProps) {
  return (
    <section className="stride-cinema-card stride-grid-bg relative overflow-hidden p-5 md:p-7">
      <div
        aria-hidden="true"
        className="stride-chapter-num pointer-events-none absolute -top-3 right-4 hidden text-[76px] opacity-60 sm:block"
      >
        /{index}
      </div>
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-2">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--stride-glass-border)] bg-[var(--stride-bg-glass)] px-3 py-1 text-[11px] font-bold tracking-wider uppercase text-[var(--stride-accent)]">
            <Sparkle size={13} weight="fill" />
            <span>/ {index} · {eyebrow}</span>
          </div>
          <h1 className="text-2xl leading-tight font-bold text-[var(--stride-text-primary)] md:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs leading-relaxed text-[var(--stride-text-secondary)] md:text-sm">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="relative z-10 flex shrink-0 items-center gap-2.5">{action}</div>}
      </div>
    </section>
  );
}
