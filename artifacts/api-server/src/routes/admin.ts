import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// In dev: process.cwd() = artifacts/api-server/ → workspace root is ../../
// In production: process.cwd() = workspace root (node started from there)
function findWorkspaceRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "pnpm-workspace.yaml"))) return cwd;
  const up2 = path.resolve(cwd, "../..");
  if (fs.existsSync(path.join(up2, "pnpm-workspace.yaml"))) return up2;
  return cwd;
}

const WORKSPACE_ROOT = findWorkspaceRoot();

const router = Router();

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAdminKey(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Admin not configured (SESSION_SECRET missing)" });
    return;
  }
  const auth = req.headers["authorization"] ?? "";
  const key = String(req.query.key ?? "");
  if (auth !== `Bearer ${secret}` && key !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ── Background job tracker ────────────────────────────────────────────────────
interface Job {
  script: string;
  status: "running" | "completed" | "failed";
  exitCode: number | null;
  output: string[];
  startedAt: string;
  finishedAt?: string;
}

const jobs = new Map<string, Job>();
let jobCounter = 0;

function spawnScript(scriptName: string): string {
  const jobId = `job-${++jobCounter}-${Date.now()}`;
  const wsRoot = WORKSPACE_ROOT;

  const job: Job = {
    script: scriptName,
    status: "running",
    exitCode: null,
    output: [],
    startedAt: new Date().toISOString(),
  };
  jobs.set(jobId, job);

  const proc = spawn("pnpm", ["--filter", "@workspace/scripts", "run", scriptName], {
    cwd: wsRoot,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout?.on("data", (d: Buffer) => {
    const lines = d.toString().split("\n");
    job.output.push(...lines.filter(l => l.trim()));
    if (job.output.length > 500) job.output = job.output.slice(-500);
  });
  proc.stderr?.on("data", (d: Buffer) => {
    const lines = d.toString().split("\n");
    job.output.push(...lines.map(l => `[err] ${l}`).filter(l => l.trim() !== "[err] "));
    if (job.output.length > 500) job.output = job.output.slice(-500);
  });
  proc.on("close", (code) => {
    job.exitCode = code;
    job.status = code === 0 ? "completed" : "failed";
    job.finishedAt = new Date().toISOString();
  });

  return jobId;
}

// ── GET /api/admin/status ─────────────────────────────────────────────────────
router.get("/admin/status", requireAdminKey, async (req, res) => {
  try {
    const counts = await db.execute<{ table_name: string; cnt: number }>(sql`
      SELECT 'candidates' AS table_name, COUNT(*)::int AS cnt FROM candidates
      UNION ALL
      SELECT 'transmission_lines', COUNT(*)::int FROM transmission_lines
      UNION ALL
      SELECT 'ercot_node_stats', COUNT(*)::int FROM ercot_node_stats
      UNION ALL
      SELECT 'caiso_node_stats', COUNT(*)::int FROM caiso_node_stats
      UNION ALL
      SELECT 'queue_projects', COUNT(*)::int FROM queue_projects
    `);

    const activeJobs = Array.from(jobs.entries())
      .filter(([, j]) => j.status === "running")
      .map(([id, j]) => ({ id, script: j.script, startedAt: j.startedAt }));

    res.json({
      db: Object.fromEntries(counts.rows.map(r => [r.table_name, r.cnt])),
      activeJobs,
      totalJobsTracked: jobs.size,
    });
  } catch (err) {
    req.log.error({ err }, "admin/status error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/admin/jobs/:id ───────────────────────────────────────────────────
router.get("/admin/jobs/:id", requireAdminKey, (req, res) => {
  const job = jobs.get(String(req.params.id));
  if (!job) { res.status(404).json({ error: "job_not_found" }); return; }
  res.json(job);
});

// ── POST /api/admin/fix-mock-scores ──────────────────────────────────────────
// Updates the 12 pre-seeded mock candidates with correct scores based on
// real ERCOT neg-price rates and CAISO curtailment data.
router.post("/admin/fix-mock-scores", requireAdminKey, async (req, res) => {
  try {
    // Correct curtailment scores for mock candidates based on real data:
    // - West Texas / Permian Basin (LZ_WEST): 7.1% neg_pct → score ~91
    // - Panhandle (HB_PAN): 21.9% neg_pct → score ~60 (already correct)
    // - CAISO zones: very low curtailment → score 90-94
    // - PJM: low curtailment → score 80-88
    const updates = [
      { name: "West Texas Wind Farm Alpha",   curtailment: "91.5", price: "82", financial: "78", dev_risk: "75", environmental: "45" },
      { name: "Permian Basin Solar I",         curtailment: "88.0", price: "87", financial: "71", dev_risk: "75", environmental: "52" },
      { name: "Mojave Desert Solar XL",        curtailment: "92.0", price: "91", financial: "82", dev_risk: "62", environmental: "92" },
      { name: "San Joaquin Solar Farm",        curtailment: "91.0", price: "90", financial: "74", dev_risk: "58", environmental: "90" },
      { name: "NorCal Wind & Storage",         curtailment: "88.0", price: "88", financial: "79", dev_risk: "58", environmental: "88" },
    ];

    let fixed = 0;
    for (const u of updates) {
      const result = await db.execute(sql`
        UPDATE candidates
        SET
          curtailment_score = ${u.curtailment}::numeric,
          price_score = ${u.price}::numeric,
          financial_score = ${u.financial}::numeric,
          development_risk_score = ${u.dev_risk}::numeric,
          environmental_score = ${u.environmental}::numeric,
          overall_score = ROUND(
            (${u.curtailment}::numeric * 0.18 +
             ${u.price}::numeric * 0.18 +
             COALESCE(interconnection_score, 50) * 0.15 +
             COALESCE(location_score, 50) * 0.12 +
             ${u.financial}::numeric * 0.12 +
             ${u.dev_risk}::numeric * 0.10 +
             COALESCE(demand_proximity_score, 50) * 0.08 +
             ${u.environmental}::numeric * 0.05 +
             COALESCE(grid_stability_score, 50) * 0.02
            ), 2),
          updated_at = NOW()
        WHERE name = ${u.name}
      `);
      if ((result as unknown as { rowCount: number }).rowCount > 0) fixed++;
    }

    res.json({ message: "Mock scores updated", candidatesFixed: fixed, updates });
  } catch (err) {
    req.log.error({ err }, "admin/fix-mock-scores error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/admin/reseed-candidates ────────────────────────────────────────
router.post("/admin/reseed-candidates", requireAdminKey, (req, res) => {
  const jobId = spawnScript("seed-candidates");
  res.status(202).json({
    message: "Candidate seeding started in background",
    jobId,
    statusUrl: `/api/admin/jobs/${jobId}`,
    note: "Poll statusUrl for progress. Inserts ~3,875 rows from scripts/data/candidates-seed.csv",
  });
});

// ── POST /api/admin/reseed-transmission-lines ─────────────────────────────────
router.post("/admin/reseed-transmission-lines", requireAdminKey, (req, res) => {
  const jobId = spawnScript("seed-transmission-lines");
  res.status(202).json({
    message: "Transmission line seeding started in background",
    jobId,
    statusUrl: `/api/admin/jobs/${jobId}`,
    note: "Downloads from HIFLD ArcGIS (~23,000 lines). Takes 5-10 minutes.",
  });
});

// ── POST /api/admin/score-candidates ─────────────────────────────────────────
router.post("/admin/score-candidates", requireAdminKey, (req, res) => {
  const jobId = spawnScript("assign-and-score-nodal");
  res.status(202).json({
    message: "Candidate scoring started in background",
    jobId,
    statusUrl: `/api/admin/jobs/${jobId}`,
    note: "Assigns nearest nodes and computes all 8 scoring dimensions.",
  });
});

// ── POST /api/admin/reseed-pjm ───────────────────────────────────────────────
router.post("/admin/reseed-pjm", requireAdminKey, (req, res) => {
  const jobId = spawnScript("seed-pjm");
  res.status(202).json({
    message: "PJM node stats seeding started in background",
    jobId,
    statusUrl: `/api/admin/jobs/${jobId}`,
    note: "Seeds PJM 8-hub/zone monthly DA/RT stats for 2022–2026.",
  });
});

// ── POST /api/admin/reseed-ercot-nodes ───────────────────────────────────────
router.post("/admin/reseed-ercot-nodes", requireAdminKey, (req, res) => {
  const jobId = spawnScript("seed-ercot-real");
  res.status(202).json({
    message: "ERCOT node stats (real CDR) seeding started",
    jobId,
    statusUrl: `/api/admin/jobs/${jobId}`,
    note: "Downloads real CDR data for 15 ERCOT hub/zone nodes. Takes 5–10 min.",
  });
});

// ── POST /api/admin/reseed-caiso-nodes ───────────────────────────────────────
router.post("/admin/reseed-caiso-nodes", requireAdminKey, (req, res) => {
  const jobId = spawnScript("seed-caiso-real");
  res.status(202).json({
    message: "CAISO node stats (real OASIS) seeding started",
    jobId,
    statusUrl: `/api/admin/jobs/${jobId}`,
    note: "Downloads real CAISO OASIS data for NP15/SP15/ZP26. Takes 3–5 min.",
  });
});

// ── POST /api/admin/reseed-all ────────────────────────────────────────────────
// Convenience: queue all steps in sequence (candidates → transmission → score)
router.post("/admin/reseed-all", requireAdminKey, (req, res) => {
  const wsRoot = WORKSPACE_ROOT;

  const jobId = `job-${++jobCounter}-${Date.now()}`;
  const job: Job = {
    script: "reseed-all",
    status: "running",
    exitCode: null,
    output: ["Starting full reseed sequence..."],
    startedAt: new Date().toISOString(),
  };
  jobs.set(jobId, job);

  const scripts = ["seed-candidates", "assign-and-score-nodal", "seed-transmission-lines"];
  let idx = 0;

  function runNext() {
    if (idx >= scripts.length) {
      job.status = "completed";
      job.exitCode = 0;
      job.finishedAt = new Date().toISOString();
      job.output.push("All steps completed successfully.");
      return;
    }
    const scriptName = scripts[idx++];
    job.output.push(`\n=== Starting: ${scriptName} ===`);

    const proc = spawn("pnpm", ["--filter", "@workspace/scripts", "run", scriptName], {
      cwd: wsRoot,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout?.on("data", (d: Buffer) => {
      const lines = d.toString().split("\n").filter(l => l.trim());
      job.output.push(...lines);
      if (job.output.length > 1000) job.output = job.output.slice(-1000);
    });
    proc.stderr?.on("data", (d: Buffer) => {
      const lines = d.toString().split("\n").filter(l => l.trim());
      job.output.push(...lines.map(l => `[err] ${l}`));
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        job.status = "failed";
        job.exitCode = code;
        job.finishedAt = new Date().toISOString();
        job.output.push(`=== FAILED: ${scriptName} (exit ${code}) ===`);
        return;
      }
      job.output.push(`=== Completed: ${scriptName} ===`);
      runNext();
    });
  }

  runNext();
  res.status(202).json({
    message: "Full reseed sequence started",
    jobId,
    statusUrl: `/api/admin/jobs/${jobId}`,
    steps: scripts,
    note: "Runs: seed-candidates → assign-and-score-nodal → seed-transmission-lines. Takes ~15 min.",
  });
});

// ── POST /api/admin/upsert-ercot-hub-stats ───────────────────────────────────
// Accepts a JSON array of hub/zone node stat rows and bulk-upserts them.
// Used to push real data from dev directly into production without XLSX parsing.
router.post("/admin/upsert-ercot-hub-stats", requireAdminKey, async (req, res) => {
  try {
    const rows = req.body as Array<{
      node: string; nodeType: string; year: number; month: number;
      avgDaPrice: number; avgRtPrice?: number | null; volatility?: number | null;
      negPricePercent?: number | null; onPeakAvg?: number | null; offPeakAvg?: number | null;
      minPrice?: number | null; maxPrice?: number | null;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "Expected non-empty array of rows" });
      return;
    }
    let upserted = 0;
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      for (const r of batch) {
        await db.execute(sql`
          INSERT INTO ercot_node_stats
            (node, node_type, year, month, avg_da_price, avg_rt_price, volatility,
             neg_price_percent, on_peak_avg, off_peak_avg, min_price, max_price)
          VALUES (
            ${r.node}, ${r.nodeType}, ${r.year}, ${r.month},
            ${r.avgDaPrice}, ${r.avgRtPrice ?? null}, ${r.volatility ?? null},
            ${r.negPricePercent ?? null}, ${r.onPeakAvg ?? null}, ${r.offPeakAvg ?? null},
            ${r.minPrice ?? null}, ${r.maxPrice ?? null}
          )
          ON CONFLICT (node, year, month) DO UPDATE SET
            avg_da_price = EXCLUDED.avg_da_price,
            avg_rt_price = EXCLUDED.avg_rt_price,
            volatility = EXCLUDED.volatility,
            neg_price_percent = EXCLUDED.neg_price_percent,
            on_peak_avg = EXCLUDED.on_peak_avg,
            off_peak_avg = EXCLUDED.off_peak_avg,
            min_price = EXCLUDED.min_price,
            max_price = EXCLUDED.max_price
        `);
        upserted++;
      }
    }
    res.json({ message: "ERCOT hub stats upserted", rows: upserted });
  } catch (err) {
    req.log.error({ err }, "admin/upsert-ercot-hub-stats error");
    res.status(500).json({ error: "internal_error", detail: String(err) });
  }
});

export default router;
