export default function Slide3Solution() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f172a]">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#14b8a6 1px, transparent 1px), linear-gradient(90deg, #14b8a6 1px, transparent 1px)",
          backgroundSize: "8vw 8vw",
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
          The Solution
        </p>
      </div>

      {/* Headline */}
      <div className="absolute top-[20vh] left-[8vw] right-[8vw]">
        <h2
          className="font-display font-black tracking-tight leading-tight"
          style={{ fontSize: "5vw", color: "#f1f5f9", textWrap: "balance" }}
        >
          One platform. Two workflows.{" "}
          <span style={{ color: "#14b8a6" }}>Real ISO data.</span>
        </h2>
      </div>

      {/* Three pillars */}
      <div className="absolute left-[8vw] right-[8vw] bottom-[10vh]" style={{ top: "38vh" }}>
        <div className="grid grid-cols-3 gap-[2.5vw] h-full">
          {/* Pillar 1 */}
          <div className="bg-[#1e293b] rounded-[1vw] p-[3vw] flex flex-col border-t-[0.4vw] border-[#14b8a6]">
            <p
              className="font-body font-medium tracking-widest uppercase mb-[1.5vh]"
              style={{ fontSize: "2.2vw", color: "#14b8a6" }}
            >
              EIA 860 Database
            </p>
            <p
              className="font-display font-black tracking-tight leading-tight mb-[2vh]"
              style={{ fontSize: "3.5vw", color: "#f1f5f9" }}
            >
              3,875 generators screened
            </p>
            <p
              className="font-body leading-relaxed"
              style={{ fontSize: "2.8vw", color: "#94a3b8" }}
            >
              All operable wind, solar, and storage projects above 1 MW across ERCOT, CAISO, and PJM — scored, ranked, and mapped.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="bg-[#1e293b] rounded-[1vw] p-[3vw] flex flex-col border-t-[0.4vw] border-[#f59e0b]">
            <p
              className="font-body font-medium tracking-widest uppercase mb-[1.5vh]"
              style={{ fontSize: "2.2vw", color: "#f59e0b" }}
            >
              Queue Analysis
            </p>
            <p
              className="font-display font-black tracking-tight leading-tight mb-[2vh]"
              style={{ fontSize: "3.5vw", color: "#f1f5f9" }}
            >
              2,433+ queue projects tracked
            </p>
            <p
              className="font-body leading-relaxed"
              style={{ fontSize: "2.8vw", color: "#94a3b8" }}
            >
              Interconnection pipeline by region — identify where queue competition is light and new project siting makes sense.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="bg-[#1e293b] rounded-[1vw] p-[3vw] flex flex-col border-t-[0.4vw] border-[#8b5cf6]">
            <p
              className="font-body font-medium tracking-widest uppercase mb-[1.5vh]"
              style={{ fontSize: "2.2vw", color: "#8b5cf6" }}
            >
              Nodal Pricing
            </p>
            <p
              className="font-display font-black tracking-tight leading-tight mb-[2vh]"
              style={{ fontSize: "3.5vw", color: "#f1f5f9" }}
            >
              28 months of real LMPs
            </p>
            <p
              className="font-body leading-relaxed"
              style={{ fontSize: "2.8vw", color: "#94a3b8" }}
            >
              1,123 settlement point nodes from ERCOT CDR and CAISO OASIS — real basis, congestion, and DA/RT spread history.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom rule */}
      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />
    </div>
  );
}
