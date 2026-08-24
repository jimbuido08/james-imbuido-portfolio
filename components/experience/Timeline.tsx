import { cx } from "@/lib/utils";

export interface TimelineSection {
  /** Optional sub-heading (e.g. a rotation or stream). */
  heading?: string;
  items: string[];
}

export interface TimelineEntry {
  period: string; // e.g. "2023 — Present" or a TODO marker
  title: string; // role or qualification
  organisation: string; // employer or institution
  location?: string;
  type?: string; // Full-time, Part-time, Internship, Contract, …
  tags?: string[]; // e.g. skills
  summary?: string; // 1–3 sentences, TODO-marked
  sections?: TimelineSection[]; // structured sub-sections with bullets
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
            {(entry.type || entry.location) && (
              <p className="text-sm text-fg-subtle">
                {entry.type}
                {entry.type && entry.location && " · "}
                {entry.location}
              </p>
            )}
            {entry.summary && (
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                {entry.summary}
              </p>
            )}
            {entry.sections?.map((section, sectionIndex) => (
              <div key={section.heading ?? sectionIndex} className="mt-4">
                {section.heading && (
                  <p className="text-sm font-semibold text-fg">
                    {section.heading}
                  </p>
                )}
                <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-fg-subtle">
                  {section.items.map((item) => (
                    <li
                      key={item}
                      className="text-sm leading-relaxed text-fg-muted"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {entry.tags && entry.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-fg-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
