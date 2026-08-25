import { DataUniverse } from "@/components/universe/DataUniverse";

export default function Home() {
  return (
    <>
      {/* Data Universe viewport — the 3D canvas fills the section. Without
          WebGL nothing renders here. */}
      <section className="relative h-[calc(100dvh-4rem)] min-h-[540px] overflow-hidden">
        <div className="absolute inset-0">
          <DataUniverse />
        </div>
      </section>
    </>
  );
}
