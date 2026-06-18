export default function Slide2Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f172a]">
      {/* Background subtle gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#0f172a] to-[#1a0a2e] opacity-100" />

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
          The Problem
        </p>
      </div>

      {/* Main layout: left headline + right pain points */}
      <div className="absolute inset-0 flex items-center pl-[8vw] pr-[6vw] pt-[18vh] pb-[10vh]">
        {/* Left: headline */}
        <div className="flex-1 pr-[4vw]">
          <h2
            className="font-display font-black tracking-tight leading-[1.0]"
            style={{ fontSize: "5.5vw", color: "#f1f5f9", textWrap: "balance" }}
          >
            Energy procurement at enterprise scale is still{" "}
            <span style={{ color: "#f59e0b" }}>flying blind.</span>
          </h2>
          <p
            className="font-body font-medium mt-[3vh] leading-relaxed"
            style={{ fontSize: "3vw", color: "#94a3b8" }}
          >
            Fortune 500 buyers manage gigawatts across multiple ISOs with no unified screening tool.
          </p>
        </div>

        {/* Vertical divider */}
        <div className="w-[1px] self-stretch bg-gradient-to-b from-transparent via-[#14b8a6]/40 to-transparent mx-[2vw]" />

        {/* Right: pain points */}
        <div className="w-[38vw] flex flex-col gap-[2.5vh]">
          {/* Pain 1 */}
          <div className="bg-[#1e293b] rounded-[0.8vw] p-[2.5vw]">
            <div className="flex items-start gap-[2vw]">
              <div className="mt-[0.4vh] w-[3vw] h-[3vw] rounded-[0.5vw] bg-[#f59e0b]/15 flex items-center justify-center shrink-0">
                <div className="w-[1vw] h-[1vw] rounded-full bg-[#f59e0b]" />
              </div>
              <div>
                <p className="font-display font-bold" style={{ fontSize: "3vw", color: "#f1f5f9" }}>No unified data layer</p>
                <p className="font-body mt-[0.5vh]" style={{ fontSize: "2.6vw", color: "#94a3b8" }}>EIA, queue, and nodal pricing live in separate systems and PDFs</p>
              </div>
            </div>
          </div>

          {/* Pain 2 */}
          <div className="bg-[#1e293b] rounded-[0.8vw] p-[2.5vw]">
            <div className="flex items-start gap-[2vw]">
              <div className="mt-[0.4vh] w-[3vw] h-[3vw] rounded-[0.5vw] bg-[#f59e0b]/15 flex items-center justify-center shrink-0">
                <div className="w-[1vw] h-[1vw] rounded-full bg-[#f59e0b]" />
              </div>
              <div>
                <p className="font-display font-bold" style={{ fontSize: "3vw", color: "#f1f5f9" }}>Risk dimensions unscored</p>
                <p className="font-body mt-[0.5vh]" style={{ fontSize: "2.6vw", color: "#94a3b8" }}>Congestion, curtailment, and basis risk require weeks of manual analysis</p>
              </div>
            </div>
          </div>

          {/* Pain 3 */}
          <div className="bg-[#1e293b] rounded-[0.8vw] p-[2.5vw]">
            <div className="flex items-start gap-[2vw]">
              <div className="mt-[0.4vh] w-[3vw] h-[3vw] rounded-[0.5vw] bg-[#f59e0b]/15 flex items-center justify-center shrink-0">
                <div className="w-[1vw] h-[1vw] rounded-full bg-[#f59e0b]" />
              </div>
              <div>
                <p className="font-display font-bold" style={{ fontSize: "3vw", color: "#f1f5f9" }}>Queue depth opaque</p>
                <p className="font-body mt-[0.5vh]" style={{ fontSize: "2.6vw", color: "#94a3b8" }}>New project siting decisions made without pipeline competition data</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom rule */}
      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />
    </div>
  );
}
