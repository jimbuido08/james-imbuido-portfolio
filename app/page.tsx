import { IndexGrid } from "@/components/home/IndexGrid";
import { DataUniverse } from "@/components/universe/DataUniverse";

export default function Home() {
  return (
    <>
      {/* Data Universe viewport — the 3D canvas fills the section. Without
          WebGL nothing renders here; the index grid below is the conventional
          content + navigation fallback (§11.1, §31 P5). */}
      <section className="relative h-[calc(100dvh-4rem)] min-h-[540px] overflow-hidden">
        <div className="absolute inset-0">
          <DataUniverse />
        </div>
      </section>
      <IndexGrid />
    </>
  );
}
