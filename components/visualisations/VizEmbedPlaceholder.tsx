import type { EmbedType } from "@/types/project";

/** Honest stand-in for the §9.1 embed slot until Phase 8 delivers embeds. */
export function VizEmbedPlaceholder({
  embedType,
  title,
}: {
  embedType: EmbedType;
  title: string;
}) {
  return (
    <div className="mt-8 flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-surface-2 p-6">
      <p className="font-mono text-xs uppercase tracking-widest text-fg-subtle">
        {title} — embedded {embedType.replaceAll("_", " ")} visualisation lands
        in Phase 8
      </p>
    </div>
  );
}
