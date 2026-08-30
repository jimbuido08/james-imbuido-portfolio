import { DataUniverse } from "@/components/universe/DataUniverse";

export default function Home() {
  return (
    <>
      {/* Data Universe viewport — the 3D canvas fills the section. Without
          WebGL (or JS) the server-rendered section link list from
          DataUniverse/UniverseFallback renders here instead. */}
      {/* Flex-sized so the section fills the space left between the Header
          and Footer — the footer stays in view without scrolling. */}
      <section className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <DataUniverse />
        </div>
      </section>
    </>
  );
}
