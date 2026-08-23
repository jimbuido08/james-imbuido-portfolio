import { cx } from "@/lib/utils";

export interface TimelineEntry {
  period: string; // e.g. "2023 — Present" or a TODO marker
  title: string; // role or qualification
  organisation: string; // employer or institution
  summary: string; // 1–3 sentences, TODO-marked
}

/** Plain two-column vertical timeline shared by Experience and Education. */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="mt-10 space-y-8">
      {entries.map((entry, index) => (
        <li
          key={entry.title}
          className={cx(
            "grid gap-2 sm:grid-cols-[10rem_1fr] sm:gap-8",
            index > 0 && "border-t border-border pt-8",
          )}
        >
          <p className="font-mono text-xs text-fg-subtle">{entry.period}</p>
          <div>
            <h3 className="text-xl font-semibold tracking-tight">
              {entry.title}
            </h3>
            <p className="text-sm text-fg-muted">{entry.organisation}</p>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              {entry.summary}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
