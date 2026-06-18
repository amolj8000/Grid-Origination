export default function Slide5DataSources() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f172a]">
      <div className="absolute left-0 top-0 bottom-0 w-[0.5vw] bg-[#14b8a6]" />
      <div className="absolute top-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />

      <div className="absolute top-[11vh] left-[8vw]">
        <p className="font-body text-[2.2vw] font-medium tracking-[0.3em] uppercase" style={{ color: "#14b8a6" }}>
          Hedging Supercenter Load · Basis Risk
        </p>
      </div>

      {/* Headline — real 2023 event */}
      <div className="absolute top-[20vh] left-[8vw] right-[8vw]">
        <h2
          className="font-display font-black tracking-tight leading-tight"
          style={{ fontSize: "4.3vw", color: "#f1f5f9", textWrap: "balance" }}
        >
          In 2023, ERCOT spot prices fell below VPPA strike prices.{" "}
          <span style={{ color: "#f59e0b" }}>Settlements ran against the buyer.</span>
        </h2>
        <p className="font-body font-medium mt-[1.5vh]" style={{ fontSize: "2.2vw", color: "#94a3b8" }}>
          VPPAs settle financially — when the node price drops below your strike, Walmart pays the developer the difference. The platform quantifies this risk before you sign, not after.
        </p>
      </div>

      {/* Three risk panels */}
      <div className="absolute left-[8vw] right-[8vw]" style={{ top: "47vh", bottom: "10vh" }}>
        <div className="grid grid-cols-3 gap-[2.5vw] h-full">

          {/* VPPA settlement risk */}
          <div className="bg-[#1e293b] rounded-[1vw] p-[2.5vw] flex flex-col border-t-[0.4vh] border-[#14b8a6]">
            <p className="font-body font-medium tracking-widest uppercase mb-[1vh]" style={{ fontSize: "2vw", color: "#14b8a6" }}>
              ERCOT VPPA Risk
            </p>
            <p className="font-display font-black leading-tight" style={{ fontSize: "3.5vw", color: "#f1f5f9" }}>
              2023 settlement trap
            </p>
            <p className="font-body mt-[1.5vh] flex-1" style={{ fontSize: "2vw", color: "#94a3b8" }}>
              Q2–Q3 2023: ERCOT wholesale prices dropped sharply. VPPAs with West Texas solar nodes settled against buyers for months. Platform maps your node's historical settlement exposure.
            </p>
            <div className="mt-auto pt-[1.5vh] border-t border-[#14b8a6]/20">
              <p className="font-body" style={{ fontSize: "1.9vw", color: "#14b8a6" }}>317,475 hourly rows · 28 months ERCOT CDR data</p>
            </div>
          </div>

          {/* CAISO curtailment + basis */}
          <div className="bg-[#1e293b] rounded-[1vw] p-[2.5vw] flex flex-col border-t-[0.4vh] border-[#f59e0b]">
            <p className="font-body font-medium tracking-widest uppercase mb-[1vh]" style={{ fontSize: "2vw", color: "#f59e0b" }}>
              CAISO Curtailment
            </p>
            <p className="font-display font-black leading-tight" style={{ fontSize: "3.5vw", color: "#f1f5f9" }}>
              SP15 solar: 75¢ capture
            </p>
            <p className="font-body mt-[1.5vh] flex-1" style={{ fontSize: "2vw", color: "#94a3b8" }}>
              SP15 solar captures only ~75¢ of every $1 DA price due to duck curve curtailment. Walmart's CA community solar deals (Pivot Energy, 72 MWac) face this shape mismatch daily.
            </p>
            <div className="mt-auto pt-[1.5vh] border-t border-[#f59e0b]/20">
              <p className="font-body" style={{ fontSize: "1.9vw", color: "#f59e0b" }}>OASIS PRC_LMP · NP15, SP15, ZP26 · 28 months</p>
            </div>
          </div>

          {/* Store-level basis */}
          <div className="bg-[#1e293b] rounded-[1vw] p-[2.5vw] flex flex-col border-t-[0.4vh] border-[#8b5cf6]">
            <p className="font-body font-medium tracking-widest uppercase mb-[1vh]" style={{ fontSize: "2vw", color: "#8b5cf6" }}>
              Store → Node Basis
            </p>
            <p className="font-display font-black leading-tight" style={{ fontSize: "3.5vw", color: "#f1f5f9" }}>
              Per-store scoring
            </p>
            <p className="font-body mt-[1.5vh] flex-1" style={{ fontSize: "2vw", color: "#94a3b8" }}>
              Every Walmart supercenter geolocated to its nearest ERCOT/CAISO settlement point. Platform runs the 28-month basis history between that store's node and any candidate PPA generation node.
            </p>
            <div className="mt-auto pt-[1.5vh] border-t border-[#8b5cf6]/20">
              <p className="font-body" style={{ fontSize: "1.9vw", color: "#8b5cf6" }}>1,123 ERCOT nodes · 1,774 CAISO pricing nodes</p>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] h-[1px] bg-gradient-to-r from-[#14b8a6] via-[#14b8a6]/40 to-transparent" />
    </div>
  );
}
