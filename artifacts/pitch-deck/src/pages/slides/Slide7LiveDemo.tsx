export default function Slide7LiveDemo() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f172a]">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(#14b8a6 1px, transparent 1px), linear-gradient(90deg, #14b8a6 1px, transparent 1px)",
          backgroundSize: "6vw 6vw",
        }}
      />

      {/* Teal glow from bottom-left */}
      <div
        className="absolute bottom-0 left-0 w-[60vw] h-[50vh] opacity-[0.12]"
        style={{
          background: "radial-gradient(ellipse at 0% 100%, #14b8a6, transparent 70%)",
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
          Live Demo
        </p>
      </div>

      {/* Main centered content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[10vw]">
        <h2
          className="font-display font-black tracking-tight text-center leading-[1.0]"
          style={{ fontSize: "6.5vw", color: "#f1f5f9", textWrap: "balance" }}
        >
          The platform is live.
        </h2>

        <div className="mt-[3vh] h-[0.4vh] w-[12vw] bg-[#14b8a6] rounded-full" />

        <p
          className="font-body font-medium text-center mt-[3.5vh] max-w-[60vw] leading-relaxed"
          style={{ fontSize: "3vw", color: "#94a3b8" }}
        >
          Screen all 3,875 generators, explore the ERCOT congestion heatmap, run queue depth analysis, and export ranked candidates — in a single session.
        </p>

        {/* Three workflow callouts */}
        <div className="flex gap-[4vw] mt-[6vh]">
          <div className="text-center">
            <p className="font-display font-black" style={{ fontSize: "4vw", color: "#14b8a6" }}>PPA Origination</p>
            <p className="font-body mt-[0.5vh]" style={{ fontSize: "2.6vw", color: "#94a3b8" }}>Screen → Score → Export</p>
          </div>
          <div className="w-[1px] bg-[#94a3b8]/20 self-stretch" />
          <div className="text-center">
            <p className="font-display font-black" style={{ fontSize: "4vw", color: "#f59e0b" }}>Queue Siting</p>
            <p className="font-body mt-[0.5vh]" style={{ fontSize: "2.6vw", color: "#94a3b8" }}>Queue Depth → Congestion → Rank</p>
          </div>
          <div className="w-[1px] bg-[#94a3b8]/20 self-stretch" />
          <div className="text-center">
            <p className="font-display font-black" style={{ fontSize: "4vw", color: "#8b5cf6" }}>Nodal Analysis</p>
            <p className="font-body mt-[0.5vh]" style={{ fontSize: "2.6vw", color: "#94a3b8" }}>DA/RT Spread → Basis Risk</p>
          </div>
        </div>
      </div>

      {/* Bottom rule */}
      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />
    </div>
  );
}
