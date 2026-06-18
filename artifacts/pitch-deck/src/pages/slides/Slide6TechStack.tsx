export default function Slide6TechStack() {
  const opportunities = [
    {
      icon: "🔌",
      color: "#14b8a6",
      title: "Walmart EV Fast-Charging Network",
      subtitle: "Own-branded, launched April 2025",
      stats: [
        "56 stations / 350 stalls live (June 2026)",
        "15 active in Texas — all in ERCOT market",
        "ABB A400 DC: 350–500 kW per station",
      ],
      body: "Walmart launched its own-branded DC fast-charging network in April 2025. Texas (ERCOT) is the largest market with 15 active stations. Target: thousands of stalls by 2030, creating 150–200 MW+ of coincident ERCOT peak load.",
    },
    {
      icon: "🔋",
      color: "#f59e0b",
      title: "Battery Storage Co-location",
      subtitle: "Peak shaving + ERCOT ancillary revenue",
      stats: [
        "1–5 MW / 4-hr battery per EV hub",
        "ERCOT ORDC: up to $9,000/MWh scarcity",
        "Demand charge savings: $15–30/MWh avg",
      ],
      body: "Co-locate a battery at each EV charging hub: shift the 350–500 kW charging load off-peak, capture ERCOT ancillary (ORDC) revenue during scarcity events, and reduce demand charges that spike Walmart's retail rate.",
    },
    {
      icon: "☀️",
      color: "#8b5cf6",
      title: "On-site Solar + Storage Hedge",
      subtitle: "Distribution centers + large supercenters",
      stats: [
        "1–3 MW rooftop/canopy per supercenter",
        "IRA ITC: 30–40% credit with adders",
        "Pairs with community solar (Pivot: 72 MWac)",
      ],
      body: "Platform identifies which ERCOT/CAISO stores sit in nodes where solar capture price is highest — prioritizing co-location investments. Pairs with Walmart's existing Pivot Energy (CA/CO) and Reactivate (70 MWac) community solar deals.",
    },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f172a]">
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(circle, #14b8a6 1px, transparent 1px)",
          backgroundSize: "4vw 4vw",
        }}
      />
      <div className="absolute left-0 top-0 bottom-0 w-[0.5vw] bg-[#14b8a6]" />
      <div className="absolute top-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />

      <div className="absolute top-[11vh] left-[8vw] right-[8vw] flex items-baseline justify-between">
        <p className="font-body text-[2.2vw] font-medium tracking-[0.3em] uppercase" style={{ color: "#14b8a6" }}>
          EV Charging + Battery Storage
        </p>
        <p className="font-body text-[2vw]" style={{ color: "#94a3b8" }}>
          New load = new opportunity to hedge
        </p>
      </div>

      <div className="absolute top-[20vh] left-[8vw] right-[8vw]">
        <h2
          className="font-display font-black tracking-tight leading-tight"
          style={{ fontSize: "4vw", color: "#f1f5f9", textWrap: "balance" }}
        >
          56 stations live. Thousands by 2030.{" "}
          <span style={{ color: "#f59e0b" }}>Each one is a new ERCOT load node</span>{" "}
          that needs a hedging strategy.
        </h2>
      </div>

      {/* Three columns */}
      <div className="absolute left-[8vw] right-[8vw]" style={{ top: "38vh", bottom: "10vh" }}>
        <div className="grid grid-cols-3 gap-[2.5vw] h-full">
          {opportunities.map((o) => (
            <div
              key={o.title}
              className="bg-[#1e293b] rounded-[1vw] p-[2.2vw] flex flex-col"
              style={{ borderTop: `0.4vh solid ${o.color}` }}
            >
              <div className="flex items-center gap-[1vw] mb-[1.2vh]">
                <span style={{ fontSize: "3vw" }}>{o.icon}</span>
                <div>
                  <p className="font-display font-black leading-tight" style={{ fontSize: "2.4vw", color: "#f1f5f9" }}>{o.title}</p>
                  <p className="font-body" style={{ fontSize: "1.75vw", color: o.color }}>{o.subtitle}</p>
                </div>
              </div>

              <p className="font-body leading-relaxed flex-1" style={{ fontSize: "1.9vw", color: "#94a3b8" }}>{o.body}</p>

              <div className="mt-[1.5vh] flex flex-col gap-[0.5vh]">
                {o.stats.map((s) => (
                  <div key={s} className="flex items-start gap-[0.8vw]">
                    <div className="w-[0.5vw] h-[0.5vw] rounded-full shrink-0 mt-[0.5vh]" style={{ background: o.color }} />
                    <span className="font-body font-medium" style={{ fontSize: "1.75vw", color: o.color }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />
    </div>
  );
}
