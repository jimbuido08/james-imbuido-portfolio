import { NAV_ITEMS } from "@/lib/navigation";

/**
 * §11.1 no-WebGL fallback: a plain, server-rendered section link list. The
 * page's SSR HTML always contains it (client components still render to HTML
 * on first load), and DataUniverse removes it only once a real canvas is live
 * — so crawlers, no-JS visitors, and WebGL-less devices all get full
 * navigation, and the 3D layer stays an enhancement rather than the only path.
 */
export function UniverseFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <ul className="flex flex-col gap-2 text-center">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="text-sm text-fg-muted underline decoration-border underline-offset-4 hover:text-fg hover:decoration-border-strong"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
