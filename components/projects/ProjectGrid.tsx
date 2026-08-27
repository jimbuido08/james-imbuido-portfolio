"use client";

import { useState } from "react";

import { ProjectCard } from "@/components/projects/ProjectCard";
import { Button } from "@/components/ui/Button";
import { AI_ML_FILTERS } from "@/lib/content/filters";
import type { Project } from "@/types/project";

export function ProjectGrid({
  projects,
  filters,
  hrefBase,
  emptyMessage,
}: {
  projects: Project[];
  /** Serializable projection of the filter defs from the SERVER page. */
  filters: { key: string; label: string }[];
  hrefBase: string;
  emptyMessage: string;
}) {
  const [active, setActive] = useState("all");
  const filterSet = AI_ML_FILTERS;
  const activeFilter = filterSet.find((f) => f.key === active) ?? filterSet[0];

  if (projects.length === 0) {
    return (
      <p className="mt-12 text-center text-sm text-fg-subtle">
        No projects published yet — content is being written.
      </p>
    );
  }

  const visible = projects.filter(activeFilter.matches);

  return (
    <>
      <div
        className="mt-10 flex flex-wrap gap-2"
        role="group"
        aria-label="Project filters"
      >
        {filters.map((filter) => (
          <Button
            key={filter.key}
            variant={filter.key === active ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={filter.key === active}
            onClick={() => setActive(filter.key)}
          >
            {filter.label}
          </Button>
        ))}
      </div>
      {visible.length > 0 ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {visible.map((project) => (
            <ProjectCard
              key={project.slug}
              project={project}
              hrefBase={hrefBase}
            />
          ))}
        </div>
      ) : (
        <p className="mt-12 text-center text-sm text-fg-subtle">
          {emptyMessage}
        </p>
      )}
    </>
  );
}
