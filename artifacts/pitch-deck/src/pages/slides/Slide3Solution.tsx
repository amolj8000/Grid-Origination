export default function Slide3Solution() {
  const levers = [
    {
      number: "01",
      color: "#14b8a6",
      title: "PPA & Offtake Origination",
      body: "Your March 2024 bundle added 842 MW: 162 MWac EDPR NA Texas solar (15-yr), NextEra in AR/LA/MS, Invenergy. This platform finds the next tranche — screen by ISO, congestion profile, and sponsor quality before the RFP drops.",
      metrics: ["$30–45/MWh solar · $25–40/MWh wind", "15-yr term (EDPR NA TX benchmark)", "NextEra · Invenergy · EDPR · Avangrid"],
    },
    {
      number: "02",
      color: "#f59e0b",
      title: "Tolling Agreements",
      body: "Lock in dispatchable capacity at a fixed monthly fee — no fuel price exposure. When ERCOT scarcity prices spike (as they did in Feb 2021 and winter 2024), Walmart dispatches the tolled unit and captures the spread.",
      metrics: ["ERCOT scarcity: $9,000/MWh cap events", "Fixed capacity fee · variable fuel cost", "Gas spark spread analytics by node"],
    },
    {
      number: "03",
      color: "#8b5cf6",
      title: "Supercenter Load Hedging + EV",
      body: "Walmart's own-branded EV network launched 2025 — 56 stations, 350 stalls live, 15 in Texas. Each fast-charge hub adds 350–500 kW of new ERCOT load. Platform sizes storage co-location to offset demand charges and earn ancillary revenue.",
      metrics: ["56 stations / 350 stalls · 15 in ERCOT", "350–500 kW DC per station (ABB A400)", "On-site storage → ORDC ancillary upside"],
    },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f172a]">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(circle, #14b8a6 1px, transparent 1px)",
          backgroundSize: "4vw 4vw",
        }}
      />
      <div className="absolute left-0 top-0 bottom-0 w-[0.5vw] bg-[#14b8a6]" />
      <div className="absolute top-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />

      <div className="absolute top-[11vh] left-[8vw] right-[8vw] flex items-baseline justify-between">
        <p className="font-body text-[2.2vw] font-medium tracking-[0.3em] uppercase" style={{ color: "#14b8a6" }}>
          Three Strategic Levers
        </p>
        <p className="font-body text-[2vw]" style={{ color: "#94a3b8" }}>
          One platform. All three workflows.
        </p>
      </div>

      <div className="absolute top-[20vh] left-[8vw] right-[8vw] bottom-[10vh] flex gap-[2.5vw]">
        {levers.map((l) => (
          <div
            key={l.number}
            className="flex-1 bg-[#1e293b] rounded-[1vw] p-[2.5vw] flex flex-col overflow-hidden"
            style={{ borderTop: `0.4vh solid ${l.color}` }}
          >
            <p className="font-display font-black shrink-0" style={{ fontSize: "3.5vw", color: l.color, opacity: 0.25 }}>
              {l.number}
            </p>
            <h3 className="font-display font-black mt-[0.5vh] leading-tight shrink-0" style={{ fontSize: "2.8vw", color: "#f1f5f9" }}>
              {l.title}
            </h3>
            <p className="font-body mt-[1.5vh] leading-relaxed flex-1 overflow-hidden" style={{ fontSize: "1.9vw", color: "#94a3b8" }}>
              {l.body}
            </p>
            <div className="flex flex-col gap-[0.7vh] mt-[2vh] shrink-0">
              {l.metrics.map((m) => (
                <div
                  key={m}
                  className="flex items-center gap-[0.8vw] rounded-[0.4vw] px-[1.2vw] py-[0.5vh]"
                  style={{ background: `${l.color}12` }}
                >
                  <div className="w-[0.5vw] h-[0.5vw] rounded-full shrink-0" style={{ background: l.color }} />
                  <span className="font-body font-medium" style={{ fontSize: "1.75vw", color: l.color }}>{m}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />
    </div>
  );
}
