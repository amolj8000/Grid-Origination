export default function Slide1Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f172a]">
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(#14b8a6 1px, transparent 1px), linear-gradient(90deg, #14b8a6 1px, transparent 1px)",
          backgroundSize: "6vw 6vw",
        }}
      />

      {/* Left teal accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[0.5vw] bg-[#14b8a6]" />

      {/* Top decorative rule */}
      <div className="absolute top-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />

      {/* Main content */}
      <div className="absolute inset-0 flex flex-col justify-center pl-[8vw] pr-[12vw]">
        {/* Overline label */}
        <p
          className="font-body text-[2.2vw] font-medium tracking-[0.3em] uppercase mb-[3vh]"
          style={{ color: "#14b8a6" }}
        >
          Power Market Intelligence
        </p>

        {/* Hero headline */}
        <h1
          className="font-display font-black leading-[0.95] tracking-tighter mb-[4vh]"
          style={{ fontSize: "9vw", color: "#f1f5f9", textWrap: "balance" }}
        >
          Grid Origination
          <span style={{ color: "#14b8a6" }}> Intelligence</span>
        </h1>

        {/* Subtitle */}
        <p
          className="font-body font-medium leading-relaxed max-w-[52vw]"
          style={{ fontSize: "3vw", color: "#94a3b8" }}
        >
          PPA origination + greenfield siting — powered by real ERCOT, CAISO, and PJM nodal data
        </p>

        {/* Bottom rule + market labels */}
        <div className="flex items-center gap-[4vw] mt-[6vh]">
          <div className="h-[1px] w-[8vw] bg-[#14b8a6]" />
          <span className="font-body text-[2.5vw] font-medium" style={{ color: "#f1f5f9" }}>ERCOT</span>
          <div className="h-[1px] w-[2vw] bg-[#94a3b8]/30" />
          <span className="font-body text-[2.5vw] font-medium" style={{ color: "#f1f5f9" }}>CAISO</span>
          <div className="h-[1px] w-[2vw] bg-[#94a3b8]/30" />
          <span className="font-body text-[2.5vw] font-medium" style={{ color: "#f1f5f9" }}>PJM</span>
        </div>
      </div>

      {/* Right side geometric accent */}
      <div className="absolute right-[6vw] top-[50%] -translate-y-1/2 flex flex-col items-end gap-[1.5vh]">
        <div className="w-[18vw] h-[1px] bg-gradient-to-l from-[#14b8a6]/60 to-transparent" />
        <div className="w-[12vw] h-[1px] bg-gradient-to-l from-[#f59e0b]/40 to-transparent" />
        <div className="w-[8vw] h-[1px] bg-gradient-to-l from-[#8b5cf6]/40 to-transparent" />
      </div>

      {/* Bottom rule */}
      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />
    </div>
  );
}
