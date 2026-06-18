export default function Slide5DataSources() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f172a]">
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
          Real Data Sources
        </p>
      </div>

      {/* Headline */}
      <div className="absolute top-[20vh] left-[8vw] right-[8vw]">
        <h2
          className="font-display font-black tracking-tight leading-tight"
          style={{ fontSize: "4.5vw", color: "#f1f5f9" }}
        >
          No synthetic pricing. Every number is sourced.
        </h2>
      </div>

      {/* Data source cards */}
      <div className="absolute left-[8vw] right-[8vw]" style={{ top: "36vh", bottom: "10vh" }}>
        <div className="grid grid-cols-3 gap-[2.5vw] h-full">
          {/* ERCOT */}
          <div className="bg-[#1e293b] rounded-[1vw] p-[2.8vw] flex flex-col">
            <div className="flex items-center justify-between mb-[2vh]">
              <p
                className="font-display font-black tracking-tight"
                style={{ fontSize: "3.5vw", color: "#14b8a6" }}
              >
                ERCOT
              </p>
              <div className="bg-[#14b8a6]/15 rounded-[0.5vw] px-[1vw] py-[0.5vh]">
                <p className="font-body font-medium" style={{ fontSize: "2.2vw", color: "#14b8a6" }}>
                  Real
                </p>
              </div>
            </div>
            <div className="h-[1px] bg-[#14b8a6]/30 mb-[2vh]" />
            <p className="font-body mb-[1vh]" style={{ fontSize: "2.8vw", color: "#f1f5f9" }}>
              CDR Reports 13060 + 13061
            </p>
            <p className="font-body leading-relaxed" style={{ fontSize: "2.6vw", color: "#94a3b8" }}>
              Hub/zone DA + RT prices — 15 nodes, 28 months
            </p>
            <div className="mt-auto pt-[2vh] border-t border-[#14b8a6]/20">
              <p className="font-display font-bold" style={{ fontSize: "3.2vw", color: "#f1f5f9" }}>
                1,123 resource nodes
              </p>
              <p className="font-body" style={{ fontSize: "2.4vw", color: "#94a3b8" }}>
                27,193 rows of real LMP history
              </p>
            </div>
          </div>

          {/* CAISO */}
          <div className="bg-[#1e293b] rounded-[1vw] p-[2.8vw] flex flex-col">
            <div className="flex items-center justify-between mb-[2vh]">
              <p
                className="font-display font-black tracking-tight"
                style={{ fontSize: "3.5vw", color: "#f59e0b" }}
              >
                CAISO
              </p>
              <div className="bg-[#f59e0b]/15 rounded-[0.5vw] px-[1vw] py-[0.5vh]">
                <p className="font-body font-medium" style={{ fontSize: "2.2vw", color: "#f59e0b" }}>
                  Real
                </p>
              </div>
            </div>
            <div className="h-[1px] bg-[#f59e0b]/30 mb-[2vh]" />
            <p className="font-body mb-[1vh]" style={{ fontSize: "2.8vw", color: "#f1f5f9" }}>
              OASIS PRC_LMP API
            </p>
            <p className="font-body leading-relaxed" style={{ fontSize: "2.6vw", color: "#94a3b8" }}>
              SP15, NP15, ZP26 — DA market prices, 28 months
            </p>
            <div className="mt-auto pt-[2vh] border-t border-[#f59e0b]/20">
              <p className="font-display font-bold" style={{ fontSize: "3.2vw", color: "#f1f5f9" }}>
                1,774 pricing nodes
              </p>
              <p className="font-body" style={{ fontSize: "2.4vw", color: "#94a3b8" }}>
                NP15/SP15/ZP26 zone assignment
              </p>
            </div>
          </div>

          {/* EIA + Queue */}
          <div className="bg-[#1e293b] rounded-[1vw] p-[2.8vw] flex flex-col">
            <div className="flex items-center justify-between mb-[2vh]">
              <p
                className="font-display font-black tracking-tight"
                style={{ fontSize: "3.5vw", color: "#8b5cf6" }}
              >
                EIA 860
              </p>
              <div className="bg-[#8b5cf6]/15 rounded-[0.5vw] px-[1vw] py-[0.5vh]">
                <p className="font-body font-medium" style={{ fontSize: "2.2vw", color: "#8b5cf6" }}>
                  Live 2024
                </p>
              </div>
            </div>
            <div className="h-[1px] bg-[#8b5cf6]/30 mb-[2vh]" />
            <p className="font-body mb-[1vh]" style={{ fontSize: "2.8vw", color: "#f1f5f9" }}>
              Form 860 Operable Sheet
            </p>
            <p className="font-body leading-relaxed" style={{ fontSize: "2.6vw", color: "#94a3b8" }}>
              All generators above 1 MW — BA code mapped to ISO
            </p>
            <div className="mt-auto pt-[2vh] border-t border-[#8b5cf6]/20">
              <p className="font-display font-bold" style={{ fontSize: "3.2vw", color: "#f1f5f9" }}>
                3,875 generators
              </p>
              <p className="font-body" style={{ fontSize: "2.4vw", color: "#94a3b8" }}>
                Wind, solar, storage — 3 ISOs
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom rule */}
      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />
    </div>
  );
}
