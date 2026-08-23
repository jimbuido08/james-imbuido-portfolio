import { useEffect, useRef } from "react";

import { cx } from "@/lib/utils";
import type { MoveSnapshot } from "@/types/chess";

/** SAN move history, paired by full move. Auto-scrolls to the latest row. */
export function MoveList({ history }: { history: MoveSnapshot[] }) {
  const lastRowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    lastRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [history.length]);

  const pairs: Array<{ number: number; white: string; black: string | null }> =
    [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      number: i / 2 + 1,
      white: history[i].san,
      black: history[i + 1]?.san ?? null,
    });
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-fg-subtle">
        Moves
      </p>
      {pairs.length === 0 ? (
        <p className="mt-4 text-sm text-fg-subtle">No moves yet.</p>
      ) : (
        <div className="mt-4 lg:max-h-[32rem] lg:overflow-y-auto">
          <ol>
            {pairs.map((pair, i) => {
              const latest = i === pairs.length - 1;
              return (
                <li
                  key={pair.number}
                  ref={latest ? lastRowRef : undefined}
                  className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 border-b border-border py-1.5 font-mono text-sm"
                >
                  <span className="text-fg-subtle">{pair.number}.</span>
                  <span className={cx(latest ? "text-fg" : "text-fg-muted")}>
                    {pair.white}
                  </span>
                  <span className={cx(latest ? "text-fg" : "text-fg-muted")}>
                    {pair.black ?? "—"}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
