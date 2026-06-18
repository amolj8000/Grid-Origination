export default function Slide6TechStack() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f172a]">
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(circle, #14b8a6 1px, transparent 1px)",
          backgroundSize: "4vw 4vw",
        }}
      />

      {/* Left teal accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[0.5vw] bg-[#14b8a6]" />

      {/* Top rule */}
      <div className="absolute top-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />

      {/* Label */}
      <div className="absolute top-[11vh] left-[8vw]">
        <p
          className="font-body text-[2.2vw] font-medium tracking-[0.3em] uppercase"
          style={{ color: "#14b8a6" }}
        >
          Tech Stack
        </p>
      </div>

      {/* Layout: left headline, right stack grid */}
      <div className="absolute left-[8vw] right-[8vw]" style={{ top: "22vh", bottom: "10vh" }}>
        <div className="flex gap-[4vw] h-full">
          {/* Left: headline + description */}
          <div className="w-[32vw] flex flex-col justify-center">
            <h2
              className="font-display font-black tracking-tight leading-[1.05]"
              style={{ fontSize: "4.5vw", color: "#f1f5f9", textWrap: "balance" }}
            >
              Production-grade, fully typed, contract-first.
            </h2>
            <p
              className="font-body font-medium mt-[3vh] leading-relaxed"
              style={{ fontSize: "2.8vw", color: "#94a3b8" }}
            >
              OpenAPI spec drives Zod validation and React Query hooks. PyPSA OPF engine runs real network analysis.
            </p>
            <div className="mt-[4vh] flex flex-col gap-[1.5vh]">
              <div className="flex items-center gap-[1.5vw]">
                <div className="w-[1.5vw] h-[1px] bg-[#14b8a6]" />
                <p className="font-body" style={{ fontSize: "2.8vw", color: "#94a3b8" }}>
                  TypeScript 5.9 end-to-end
                </p>
              </div>
              <div className="flex items-center gap-[1.5vw]">
                <div className="w-[1.5vw] h-[1px] bg-[#14b8a6]" />
                <p className="font-body" style={{ fontSize: "2.8vw", color: "#94a3b8" }}>
                  pnpm monorepo, Orval codegen
                </p>
              </div>
              <div className="flex items-center gap-[1.5vw]">
                <div className="w-[1.5vw] h-[1px] bg-[#14b8a6]" />
                <p className="font-body" style={{ fontSize: "2.8vw", color: "#94a3b8" }}>
                  Drizzle ORM + PostgreSQL
                </p>
              </div>
            </div>
          </div>

          {/* Vertical divider */}
          <div className="w-[1px] self-stretch bg-gradient-to-b from-transparent via-[#14b8a6]/30 to-transparent" />

          {/* Right: stack grid */}
          <div className="flex-1 grid grid-cols-2 gap-[1.5vw] content-center">
            {/* Frontend */}
            <div className="bg-[#1e293b] rounded-[0.8vw] p-[2vw]">
              <p className="font-body text-[2.2vw] tracking-widest uppercase mb-[1vh]" style={{ color: "#14b8a6" }}>Frontend</p>
              <p className="font-display font-bold" style={{ fontSize: "3vw", color: "#f1f5f9" }}>React 18 + Vite</p>
              <p className="font-body mt-[0.5vh]" style={{ fontSize: "2.5vw", color: "#94a3b8" }}>Tailwind, shadcn/ui, Wouter, Leaflet maps</p>
            </div>

            {/* API */}
            <div className="bg-[#1e293b] rounded-[0.8vw] p-[2vw]">
              <p className="font-body text-[2.2vw] tracking-widest uppercase mb-[1vh]" style={{ color: "#f59e0b" }}>API</p>
              <p className="font-display font-bold" style={{ fontSize: "3vw", color: "#f1f5f9" }}>Express 5</p>
              <p className="font-body mt-[0.5vh]" style={{ fontSize: "2.5vw", color: "#94a3b8" }}>OpenAPI-first, Zod validation, TanStack Query</p>
            </div>

            {/* Database */}
            <div className="bg-[#1e293b] rounded-[0.8vw] p-[2vw]">
              <p className="font-body text-[2.2vw] tracking-widest uppercase mb-[1vh]" style={{ color: "#8b5cf6" }}>Database</p>
              <p className="font-display font-bold" style={{ fontSize: "3vw", color: "#f1f5f9" }}>PostgreSQL</p>
              <p className="font-body mt-[0.5vh]" style={{ fontSize: "2.5vw", color: "#94a3b8" }}>Drizzle ORM, drizzle-zod, 29k+ real LMP rows</p>
            </div>

            {/* Analytics */}
            <div className="bg-[#1e293b] rounded-[0.8vw] p-[2vw]">
              <p className="font-body text-[2.2vw] tracking-widest uppercase mb-[1vh]" style={{ color: "#94a3b8" }}>Analytics</p>
              <p className="font-display font-bold" style={{ fontSize: "3vw", color: "#f1f5f9" }}>PyPSA OPF</p>
              <p className="font-body mt-[0.5vh]" style={{ fontSize: "2.5vw", color: "#94a3b8" }}>Python microservice, HiGHS LP solver, Recharts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom rule */}
      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />
    </div>
  );
}
