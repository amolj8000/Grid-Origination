export default function Slide4Scoring() {
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
          Scoring Engine
        </p>
      </div>

      {/* Left column: headline + hero stat */}
      <div className="absolute left-[8vw] top-[20vh] bottom-[10vh] w-[36vw] flex flex-col justify-between">
        <div>
          <h2
            className="font-display font-black tracking-tight leading-[1.0]"
            style={{ fontSize: "5vw", color: "#f1f5f9", textWrap: "balance" }}
          >
            Eight dimensions. Every project. Fully ranked.
          </h2>
          <p
            className="font-body font-medium mt-[3vh] leading-relaxed"
            style={{ fontSize: "2.8vw", color: "#94a3b8" }}
          >
            Each EIA 860 generator receives scores sourced from real nodal and queue data — no manual analysis.
          </p>
        </div>

        {/* Hero stat */}
        <div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#14b8a6]/50 to-transparent mb-[3vh]" />
          <p
            className="font-display font-black tracking-tighter leading-none"
            style={{ fontSize: "11vw", color: "#14b8a6" }}
          >
            3,875
          </p>
          <p
            className="font-body font-medium mt-[1vh]"
            style={{ fontSize: "2.8vw", color: "#94a3b8" }}
          >
            projects ranked across 3 ISO markets
          </p>
        </div>
      </div>

      {/* Vertical divider */}
      <div className="absolute left-[49vw] top-[20vh] bottom-[10vh] w-[1px] bg-gradient-to-b from-transparent via-[#14b8a6]/30 to-transparent" />

      {/* Right column: dimension grid */}
      <div className="absolute right-[6vw] top-[20vh] bottom-[10vh] w-[44vw]">
        <div className="grid grid-cols-2 gap-[1.5vw] h-full content-start">
          {/* Row 1 */}
          <div className="bg-[#1e293b] rounded-[0.6vw] px-[2vw] py-[1.6vh] flex items-center gap-[1.5vw]">
            <div className="w-[0.6vw] h-[4vh] rounded-full bg-[#14b8a6] shrink-0" />
            <p className="font-display font-bold" style={{ fontSize: "2.8vw", color: "#f1f5f9" }}>Congestion Risk</p>
          </div>
          <div className="bg-[#1e293b] rounded-[0.6vw] px-[2vw] py-[1.6vh] flex items-center gap-[1.5vw]">
            <div className="w-[0.6vw] h-[4vh] rounded-full bg-[#14b8a6] shrink-0" />
            <p className="font-display font-bold" style={{ fontSize: "2.8vw", color: "#f1f5f9" }}>Curtailment Risk</p>
          </div>
          {/* Row 2 */}
          <div className="bg-[#1e293b] rounded-[0.6vw] px-[2vw] py-[1.6vh] flex items-center gap-[1.5vw]">
            <div className="w-[0.6vw] h-[4vh] rounded-full bg-[#f59e0b] shrink-0" />
            <p className="font-display font-bold" style={{ fontSize: "2.8vw", color: "#f1f5f9" }}>Basis Risk</p>
          </div>
          <div className="bg-[#1e293b] rounded-[0.6vw] px-[2vw] py-[1.6vh] flex items-center gap-[1.5vw]">
            <div className="w-[0.6vw] h-[4vh] rounded-full bg-[#f59e0b] shrink-0" />
            <p className="font-display font-bold" style={{ fontSize: "2.8vw", color: "#f1f5f9" }}>Tax Credit Eligibility</p>
          </div>
          {/* Row 3 */}
          <div className="bg-[#1e293b] rounded-[0.6vw] px-[2vw] py-[1.6vh] flex items-center gap-[1.5vw]">
            <div className="w-[0.6vw] h-[4vh] rounded-full bg-[#8b5cf6] shrink-0" />
            <p className="font-display font-bold" style={{ fontSize: "2.8vw", color: "#f1f5f9" }}>Sponsor Quality</p>
          </div>
          <div className="bg-[#1e293b] rounded-[0.6vw] px-[2vw] py-[1.6vh] flex items-center gap-[1.5vw]">
            <div className="w-[0.6vw] h-[4vh] rounded-full bg-[#8b5cf6] shrink-0" />
            <p className="font-display font-bold" style={{ fontSize: "2.8vw", color: "#f1f5f9" }}>Interconnect Risk</p>
          </div>
          {/* Row 4 */}
          <div className="bg-[#1e293b] rounded-[0.6vw] px-[2vw] py-[1.6vh] flex items-center gap-[1.5vw]">
            <div className="w-[0.6vw] h-[4vh] rounded-full bg-[#94a3b8] shrink-0" />
            <p className="font-display font-bold" style={{ fontSize: "2.8vw", color: "#f1f5f9" }}>Capture Price</p>
          </div>
          <div className="bg-[#1e293b] rounded-[0.6vw] px-[2vw] py-[1.6vh] flex items-center gap-[1.5vw]">
            <div className="w-[0.6vw] h-[4vh] rounded-full bg-[#94a3b8] shrink-0" />
            <p className="font-display font-bold" style={{ fontSize: "2.8vw", color: "#f1f5f9" }}>Market Revenue</p>
          </div>
        </div>
      </div>

      {/* Bottom rule */}
      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />
    </div>
  );
}
