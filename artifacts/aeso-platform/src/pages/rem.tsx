import { useState } from "react";
import {
  Workflow, ExternalLink, Download, ChevronDown, ChevronRight,
  MapPin, DollarSign, Zap, Shield, Clock, BarChart3, GitMerge,
  AlertTriangle, CheckCircle, TrendingUp, Building2, FileText,
  ArrowRight, Info, Users, Calendar,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────
   All data sourced from:
   • https://www.aeso.ca/transition/rem/
   • https://www.aeso.ca/transition/rem/key-features-of-the-restructured-energy-market/
   • https://aesoengage.aeso.ca/
   Last verified: July 2026
   ──────────────────────────────────────────────────────────────── */

const TIMELINE = [
  {
    year: "2019–2022",
    label: "Pre-REM Studies",
    status: "done",
    desc: "AESO commissioned independent reviews of Alberta's energy-only market. Market Power Mitigation review and reliability adequacy studies completed.",
  },
  {
    year: "2023–2024",
    label: "Stakeholder Engagement",
    status: "done",
    desc: "Extensive public engagement through AESO Engage platform. Multiple design consultation rounds covering LMP, ancillary services, dispatch, and settlement.",
  },
  {
    year: "2025 Q1",
    label: "Final Design Published",
    status: "done",
    desc: "AESO released the Restructured Energy Market Final Design document. Comprehensive 200+ page technical specification of all market mechanisms.",
  },
  {
    year: "2025–2026",
    label: "ISO Rules Approved",
    status: "done",
    desc: "REM ISO Rules approved by the Minister of Affordability and Utilities under Section 20.01 of the Electric Utilities Act.",
  },
  {
    year: "2025–2026",
    label: "Market Participant Readiness",
    status: "active",
    desc: "AESO working with market participants to upgrade IT systems, trading interfaces, and operational processes ahead of go-live. Industry-wide effort with tight timelines.",
  },
  {
    year: "Mid-2027",
    label: "REM Go-Live",
    status: "future",
    desc: "Full market launch: LMP pricing, real-time ramping product, enhanced DAM for operating reserves, reliability unit commitment, and security-constrained economic dispatch.",
  },
  {
    year: "2027–2035",
    label: "FTR Transition Period",
    status: "future",
    desc: "Temporary Financial Transmission Rights issued to existing generators to offset LMP congestion impacts. Phased out over 8 years. Long-term FTRs under engagement.",
  },
  {
    year: "2032",
    label: "Phase 2 Enhancements",
    status: "future",
    desc: "Offer cap rises to $2,000/MWh; price floor drops to −$100/MWh; more frequent settlement cycle aligned with 5-min dispatch; overall cap remains $3,000/MWh.",
  },
];

const FEATURES = [
  {
    icon: <MapPin size={20} className="text-teal-400" />,
    title: "Locational Marginal Pricing (LMP)",
    tag: "Pricing",
    tagColor: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    summary: "Electricity prices vary by node based on real-time grid conditions, losses, and congestion.",
    detail: `LMP ensures electricity prices reflect the true cost at each point on the grid, accounting for system line losses and congestion. This helps guide investment, reduce bottlenecks, and make better use of existing infrastructure. Most consumers will continue to pay a single Alberta-wide price. Eligible large customers (like industrial buyers) will have a one-time, irrevocable option to opt into paying their local nodal price instead — a significant decision with long-term implications.`,
    implications: ["Basis risk increases for nodal VPPAs", "Large-load one-time opt-in is irrevocable — requires analysis", "Price signals attract investment in congested areas"],
  },
  {
    icon: <DollarSign size={20} className="text-amber-400" />,
    title: "Pricing Framework & Caps",
    tag: "Pricing",
    tagColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    summary: "Energy market offer cap $1,500/MWh (2027) rising to $2,000/MWh (2032). Scarcity curve to $3,000/MWh. Floor $0 → −$100/MWh in 2032.",
    detail: `The energy market offer cap is set at $1,500/MWh at go-live, increasing to $2,000/MWh in 2032. The overall price cap is $3,000/MWh, governed by the scarcity pricing curve — which allows prices to rise when supply tightens, incentivising new investment without price spikes above the cap. The price floor remains at $0/MWh until 2032, when it drops to −$100/MWh to better accommodate renewable over-generation.`,
    implications: ["Scarcity curve → more frequent high-price events vs current", "Negative pricing in 2032 improves solar/wind economics", "Higher cap may require risk management for retail exposure"],
  },
  {
    icon: <Zap size={20} className="text-purple-400" />,
    title: "Real-Time Ramping Product",
    tag: "Reliability",
    tagColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    summary: "New ancillary service compensating generators that ramp quickly to balance real-time supply/demand deviations.",
    detail: `The ramping product addresses the growing challenge of real-time imbalances as the grid becomes more renewable-heavy. Generators that can quickly ramp output are compensated for providing this flexibility. Costs are allocated between consumers and generators based on their causation of the ramping need — incentivising self-scheduling accuracy and reducing grid balancing costs over time. This is similar to CAISO's flexible ramping product.`,
    implications: ["New cost component in PPA negotiations", "Storage and gas peakers benefit most", "Reduces real-time imbalance risk across the market"],
  },
  {
    icon: <Shield size={20} className="text-emerald-400" />,
    title: "Market Power Mitigation (MPM)",
    tag: "Competition",
    tagColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    summary: "Automated rules prevent generators from exerting market power when competition is limited, protecting consumers.",
    detail: `Market power mitigation (MPM) rules detect when a generator's offer could have a material impact on prices due to limited competition or local constraints. Offers subject to MPM are replaced with cost-based substitutes. This protects consumers from supra-competitive pricing while allowing full cost recovery to attract investment. MPM is particularly relevant in Alberta's concentrated gas market, which historically has seen price manipulation concerns.`,
    implications: ["Reduces extreme price spike risk for industrial buyers", "Generators must maintain transparent cost documentation", "May compress average pool price in tight supply periods"],
  },
  {
    icon: <BarChart3 size={20} className="text-sky-400" />,
    title: "Enhanced Day-Ahead Market (DAM)",
    tag: "Reliability",
    tagColor: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    summary: "Expanded eligibility and simplified procurement for operating reserves — more competition, lower ancillary service costs.",
    detail: `Alberta's existing Day-Ahead Market for operating reserves is enhanced with broader participation eligibility (including storage and demand response), hourly rather than product-type procurement, and simplified bidding rules. This drives more competition in the ancillary services market, which has historically been thin and expensive. More participants = lower reserve costs = lower overall system costs passed to consumers.`,
    implications: ["Lower ancillary service cost component in pool price", "Storage resources unlock new revenue streams", "More competitive landscape for operating reserve providers"],
  },
  {
    icon: <Clock size={20} className="text-orange-400" />,
    title: "Reliability Unit Commitment (RUC)",
    tag: "Reliability",
    tagColor: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    summary: "AESO can pre-commit slow-start generators when supply forecasts are tight — preventing reliability events with minimal market disruption.",
    detail: `RUC is a backstop mechanism. If the AESO's day-ahead forecast shows insufficient supply for the next operating period, it can direct specific slow-start generators (particularly gas units with long start times) to commit in advance. Costs are recovered through uplifts. This is a targeted, rarely-triggered tool designed to maintain reliability without distorting market prices broadly.`,
    implications: ["Reduces risk of load shedding events", "Potential for uplift charges in very tight supply", "Relevant when large renewable additions reduce thermal unit hours"],
  },
  {
    icon: <GitMerge size={20} className="text-pink-400" />,
    title: "Enhanced Dispatch & Settlement",
    tag: "Operations",
    tagColor: "bg-pink-500/20 text-pink-300 border-pink-500/30",
    summary: "Security-constrained economic dispatch from 2027. More frequent settlement cycle from 2032, aligned to 5-min dispatch intervals.",
    detail: `Security-constrained economic dispatch (SCED) replaces Alberta's current unconstrained merit-order dispatch. SCED considers transmission constraints when determining dispatch instructions, ensuring grid security without ad-hoc operator interventions. From 2032, settlement intervals will shorten to align with 5-minute dispatch, making price signals sharper and more attractive to demand response and flexible generators.`,
    implications: ["Clearer nodal price signals post-2032", "Tighter settlement cycles reward flexible demand response", "Generator systems require significant IT upgrades before go-live"],
  },
  {
    icon: <Building2 size={20} className="text-indigo-400" />,
    title: "Support for Existing Investors (FTRs)",
    tag: "Transition",
    tagColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    summary: "Temporary Financial Transmission Rights protect generators from LMP congestion impacts. Phased out over 8 years from go-live.",
    detail: `Generators that made investments under the current energy-only market framework receive temporary FTRs to offset the financial impact of congestion-based LMP deviations between their node and the Alberta Internal Reference Price. These FTRs are allocated based on historical generation and phased out over 8 years (2027–2035). Long-term tradeable FTRs are under stakeholder engagement to eventually replace the temporary allocations.`,
    implications: ["Existing generators protected during transition period", "Creates secondary FTR market opportunity by ~2028", "New greenfield projects will not receive FTR allocations"],
  },
];

const PRICING_TABLE = [
  { param: "Energy Offer Cap",   launch: "$1,500/MWh", phase2: "$2,000/MWh (2032)", note: "Maximum offer price in the energy market" },
  { param: "Overall Price Cap",  launch: "$3,000/MWh", phase2: "$3,000/MWh",        note: "Scarcity pricing curve ceiling" },
  { param: "Price Floor",        launch: "$0/MWh",     phase2: "−$100/MWh (2032)",  note: "Minimum clearing price; enables over-gen export economics" },
  { param: "Settlement Cycle",   launch: "Hourly",     phase2: "5-min (2032)",      note: "Aligns settlement with dispatch instructions" },
  { param: "Dispatch Algorithm", launch: "SCED",       phase2: "SCED (enhanced)",   note: "Security-constrained economic dispatch" },
  { param: "LMP Pricing",        launch: "Nodal",      phase2: "Nodal",             note: "Most consumers on Alberta-wide reference price" },
];

const BUYER_IMPACTS = [
  {
    icon: <TrendingUp size={16} className="text-amber-400" />,
    title: "Basis Risk on VPPAs / PPAs",
    color: "amber",
    risk: "High",
    desc: "LMP introduces location-specific prices. If your VPPA settles at a generator node that congests relative to the Alberta Internal Reference Price, you bear negative basis. Review nodal exposure in all new PPA contracts.",
  },
  {
    icon: <MapPin size={16} className="text-teal-400" />,
    title: "Nodal Pricing Opt-In Decision",
    color: "teal",
    risk: "Decision",
    desc: "Large customers with facilities ≥ a defined threshold get a one-time, irrevocable election to pay local nodal LMP instead of the Alberta-wide reference price. Requires detailed analysis of your nodal position before the deadline.",
  },
  {
    icon: <AlertTriangle size={16} className="text-red-400" />,
    title: "Higher Price Volatility",
    color: "red",
    risk: "Monitor",
    desc: "Scarcity pricing to $3,000/MWh and a lower negative floor create a wider price range than today. Fixed-price PPAs become more valuable as a hedge; variable-rate exposure increases. Review retail contract structures.",
  },
  {
    icon: <DollarSign size={16} className="text-purple-400" />,
    title: "New Ramping Costs in Offers",
    color: "purple",
    risk: "Low",
    desc: "Generators will factor real-time ramping service costs into energy offers. This slightly increases the all-in cost of new PPAs. However, better ancillary service pricing should reduce overall system costs.",
  },
  {
    icon: <CheckCircle size={16} className="text-emerald-400" />,
    title: "Market Power Mitigation Benefit",
    color: "emerald",
    risk: "Positive",
    desc: "MPM rules reduce the risk of price spikes caused by generator market power in concentrated supply situations. This is particularly beneficial for large industrial buyers with real-time exposure.",
  },
  {
    icon: <Zap size={16} className="text-sky-400" />,
    title: "Renewable Investment Signals",
    color: "sky",
    risk: "Positive",
    desc: "LMP + negative floor + ramping product create stronger investment signals for solar, wind, and storage. More capacity entering the market puts downward pressure on long-run average pool price, benefiting fixed-price negotiations.",
  },
];

const QUOTES = [
  {
    text: "The REM is a smart, forward-looking solution that delivers real benefits for Albertans. It supports competition, ensures long-term grid reliability, and protects consumers through strong market design.",
    name: "Hon. Nathan Neudorf",
    role: "Alberta Minister of Affordability and Utilities",
    icon: <Building2 size={14} />,
  },
  {
    text: "Our new market design marks a major milestone in Alberta's electricity sector. It reflects our shared commitment to a reliable, affordable and investment-ready market that serves Albertans today and prepares for the future.",
    name: "Aaron Engen",
    role: "President and CEO, Alberta Electric System Operator",
    icon: <Workflow size={14} />,
  },
  {
    text: "The REM is modernizing Alberta's electricity market by unlocking signals for energy storage resources. By bringing in best practices from other markets such as LMP, ramping reserves, and stronger price fidelity for flexible supply and demand, the qualities of energy storage will be more efficiently leveraged.",
    name: "Justin Rangooni",
    role: "President and CEO, Energy Storage Canada",
    icon: <Zap size={14} />,
  },
];

const DOCS = [
  {
    title: "REM Information Overview",
    desc: "High-level summary of the REM design, its benefits, and the path to implementation.",
    url: "https://www.aeso.ca/assets/REM/AESO-REM-Design-Information-Overview.pdf",
    type: "PDF",
  },
  {
    title: "Restructured Energy Market Final Design",
    desc: "Comprehensive 200+ page technical specification of all market mechanisms, rules, and transition provisions.",
    url: "https://www.aeso.ca/assets/REM/Restructured-Energy-Market-Final-Design.pdf",
    type: "PDF",
  },
  {
    title: "AESO Engage — REM Materials",
    desc: "All engagement presentations, workshop notes, Q&A responses, and consultation submissions on the REM design.",
    url: "https://aesoengage.aeso.ca/",
    type: "Web",
  },
  {
    title: "REM ISO Rules",
    desc: "Ministerially-approved ISO rules implementing the REM. Required reading for market participants.",
    url: "https://www.aeso.ca/transition/rem-iso-rules/",
    type: "Web",
  },
  {
    title: "AESO REM Transition Page",
    desc: "Official landing page with latest REM news, implementation updates, and participant readiness resources.",
    url: "https://www.aeso.ca/transition/rem/",
    type: "Web",
  },
  {
    title: "AESO Engage — REM ISO Rules Materials",
    desc: "Detailed stakeholder engagement materials specifically covering the ISO rules drafting process.",
    url: "https://aesoengage.aeso.ca/restructured-energy-market-rem-iso-rules",
    type: "Web",
  },
];

const STATUS_STYLES: Record<string, string> = {
  done:   "bg-emerald-500/20 border-emerald-500/40 text-emerald-400",
  active: "bg-amber-500/20 border-amber-500/40 text-amber-400",
  future: "bg-white/5 border-white/15 text-white/40",
};
const STATUS_DOT: Record<string, string> = {
  done:   "bg-emerald-400",
  active: "bg-amber-400 animate-pulse",
  future: "bg-white/25",
};
const RISK_BADGE: Record<string, string> = {
  High:     "bg-red-500/20 text-red-300 border-red-500/30",
  Monitor:  "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Decision: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Low:      "bg-sky-500/20 text-sky-300 border-sky-500/30",
  Positive: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-white/90">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function FeatureCard({ f, expanded, toggle }: {
  f: typeof FEATURES[number];
  expanded: boolean;
  toggle: () => void;
}) {
  return (
    <div
      className={`bg-white/3 border rounded-xl transition-all cursor-pointer ${
        expanded ? "border-white/20" : "border-white/8 hover:border-white/15"
      }`}
      onClick={toggle}
    >
      <div className="flex items-start gap-3 px-4 py-4">
        <div className="mt-0.5 shrink-0">{f.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white/90 text-sm">{f.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded border ${f.tagColor}`}>{f.tag}</span>
          </div>
          <p className="text-xs text-white/55 mt-1 leading-relaxed">{f.summary}</p>
        </div>
        <div className="shrink-0 text-white/30 mt-0.5">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-white/8 pt-4 space-y-3">
          <p className="text-sm text-white/65 leading-relaxed">{f.detail}</p>
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Procurement implications</div>
            {f.implications.map((imp, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-white/60">
                <ArrowRight size={12} className="mt-0.5 text-teal-400 shrink-0" />
                {imp}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function REM() {
  const [expandedFeature, setExpandedFeature] = useState<number | null>(0);

  const toggle = (i: number) => setExpandedFeature((p) => (p === i ? null : i));

  return (
    <div className="space-y-8 pb-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Workflow size={22} className="text-teal-400" />
            Restructured Energy Market (REM)
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Alberta's major electricity market redesign — going live mid-2027
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="https://www.aeso.ca/assets/REM/AESO-REM-Design-Information-Overview.pdf"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 rounded-lg text-sm text-teal-300 transition-colors"
          >
            <Download size={13} /> Overview PDF
          </a>
          <a
            href="https://www.aeso.ca/assets/REM/Restructured-Energy-Market-Final-Design.pdf"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white/70 transition-colors"
          >
            <FileText size={13} /> Final Design
          </a>
          <a
            href="https://aesoengage.aeso.ca/"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white/70 transition-colors"
          >
            <ExternalLink size={13} /> AESO Engage
          </a>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Go-Live", value: "Mid-2027", icon: <Calendar size={16} className="text-teal-400" />, sub: "Market implementation" },
          { label: "Price Cap", value: "$3,000", icon: <DollarSign size={16} className="text-amber-400" />, sub: "MWh — scarcity curve ceiling" },
          { label: "Offer Cap at Launch", value: "$1,500", icon: <BarChart3 size={16} className="text-sky-400" />, sub: "MWh → $2,000 in 2032" },
          { label: "FTR Phase-Out", value: "8 years", icon: <Clock size={16} className="text-purple-400" />, sub: "2027–2035 transition" },
        ].map((c) => (
          <div key={c.label} className="bg-white/3 border border-white/8 rounded-xl px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/50">{c.label}</span>
              {c.icon}
            </div>
            <div className="text-xl font-bold text-white tabular-nums">{c.value}</div>
            <div className="text-xs text-white/30 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Overview ── */}
      <Section title="What is the REM?" icon={<Info size={16} className="text-teal-400" />}>
        <div className="bg-white/3 border border-white/8 rounded-xl px-5 py-4">
          <p className="text-sm text-white/70 leading-relaxed mb-3">
            Alberta's electricity market is undergoing its most significant change in two decades. The{" "}
            <strong className="text-white/90">Restructured Energy Market (REM)</strong> modernizes the current
            energy-only design by adding Locational Marginal Pricing (LMP), new reliability services, and enhanced
            dispatch and settlement systems — while preserving Alberta's competitive market principles.
          </p>
          <p className="text-sm text-white/70 leading-relaxed">
            The REM was developed through multi-year stakeholder engagement and formally approved by the Minister of
            Affordability and Utilities. ISO Rules were developed under Section 20.01 of the{" "}
            <em>Electric Utilities Act</em>. Implementation is targeted for mid-2027, with further enhancements in 2032.
          </p>
        </div>
      </Section>

      {/* ── Timeline ── */}
      <Section title="Implementation Timeline" icon={<Calendar size={16} className="text-teal-400" />}>
        <div className="relative pl-6">
          <div className="absolute left-2.5 top-0 bottom-0 w-px bg-white/10" />
          <div className="space-y-4">
            {TIMELINE.map((t, i) => (
              <div key={i} className="relative flex gap-4">
                <div className={`absolute -left-4 top-3 w-3 h-3 rounded-full border-2 border-[#0b1622] ${STATUS_DOT[t.status]}`} />
                <div className={`flex-1 rounded-lg border px-4 py-3 ${STATUS_STYLES[t.status]}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-bold tabular-nums">{t.year}</span>
                    {t.status === "active" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-300 border border-amber-500/30">
                        In Progress
                      </span>
                    )}
                    {t.status === "done" && (
                      <CheckCircle size={12} className="text-emerald-400" />
                    )}
                  </div>
                  <div className="font-semibold text-sm mb-1">{t.label}</div>
                  <div className="text-xs opacity-80 leading-relaxed">{t.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Key Features ── */}
      <Section title="Key REM Features" icon={<Workflow size={16} className="text-teal-400" />}>
        <div className="space-y-2">
          {FEATURES.map((f, i) => (
            <FeatureCard key={i} f={f} expanded={expandedFeature === i} toggle={() => toggle(i)} />
          ))}
        </div>
      </Section>

      {/* ── Pricing Parameters Table ── */}
      <Section title="Pricing Parameters" icon={<DollarSign size={16} className="text-teal-400" />}>
        <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-white/40">
                <th className="text-left px-5 py-3 font-medium">Parameter</th>
                <th className="text-right px-4 py-3 font-medium">At Go-Live (2027)</th>
                <th className="text-right px-5 py-3 font-medium">Phase 2 (2032)</th>
              </tr>
            </thead>
            <tbody>
              {PRICING_TABLE.map((row, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/2 last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-medium text-white/80">{row.param}</div>
                    <div className="text-xs text-white/35 mt-0.5">{row.note}</div>
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums font-semibold text-teal-300/90">{row.launch}</td>
                  <td className="text-right px-5 py-3 tabular-nums text-white/60">{row.phase2}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Procurement Impact ── */}
      <Section title="Impact on Large Energy Buyers" icon={<AlertTriangle size={16} className="text-teal-400" />}>
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 mb-3 flex items-start gap-3">
          <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 leading-relaxed">
            The REM introduces material changes to how power costs are structured in Alberta. Large buyers with VPPAs,
            PPAs, or significant real-time exposure should review their positions against the changes below before the
            mid-2027 go-live.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BUYER_IMPACTS.map((b, i) => (
            <div key={i} className="bg-white/3 border border-white/8 rounded-xl px-4 py-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {b.icon}
                  <span className="font-semibold text-white/85 text-sm">{b.title}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded border ${RISK_BADGE[b.risk]}`}>{b.risk}</span>
              </div>
              <p className="text-xs text-white/55 leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Stakeholder Quotes ── */}
      <Section title="Stakeholder Perspectives" icon={<Users size={16} className="text-teal-400" />}>
        <div className="space-y-3">
          {QUOTES.map((q, i) => (
            <div key={i} className="bg-white/3 border border-white/8 rounded-xl px-5 py-4">
              <p className="text-sm text-white/65 italic leading-relaxed mb-3">"{q.text}"</p>
              <div className="flex items-center gap-2">
                <span className="text-white/30">{q.icon}</span>
                <span className="font-semibold text-white/80 text-xs">{q.name}</span>
                <span className="text-white/35 text-xs">— {q.role}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Resources ── */}
      <Section title="Resources & Documents" icon={<FileText size={16} className="text-teal-400" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DOCS.map((d, i) => (
            <a
              key={i}
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white/3 border border-white/8 hover:border-teal-500/30 rounded-xl px-4 py-4 flex items-start gap-3 transition-colors group"
            >
              <div className="mt-0.5 text-white/40 group-hover:text-teal-400 transition-colors">
                {d.type === "PDF" ? <FileText size={16} /> : <ExternalLink size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-white/80 text-sm group-hover:text-white transition-colors">{d.title}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/8 text-white/40">{d.type}</span>
                </div>
                <p className="text-xs text-white/45 leading-relaxed">{d.desc}</p>
              </div>
            </a>
          ))}
        </div>
        <div className="text-xs text-white/25 text-center pt-2">
          Source: www.aeso.ca/transition/rem/ and aesoengage.aeso.ca — content verified July 2026
        </div>
      </Section>
    </div>
  );
}
