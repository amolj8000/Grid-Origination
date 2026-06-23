import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// Dashboard summary
router.get("/aeso/dashboard", async (req, res) => {
  try {
    const priceResult = await db.execute<{
      latest_pool_price: string | null;
      latest_ail_mw: string | null;
      latest_date: string | null;
    }>(sql`
      SELECT pool_price::text AS latest_pool_price,
             ail_mw::text AS latest_ail_mw,
             date::text AS latest_date
      FROM aeso_pool_price
      ORDER BY date DESC, hour_ending DESC
      LIMIT 1
    `);
    const priceRow = priceResult.rows[0];

    const reserveResult = await db.execute<{ latest_reserve_margin_pct: string | null }>(sql`
      SELECT reserve_margin_pct::text AS latest_reserve_margin_pct
      FROM aeso_supply_demand
      ORDER BY date DESC, hour_ending DESC
      LIMIT 1
    `);
    const reserveRow = reserveResult.rows[0];

    const avgResult = await db.execute<{ avg_price: string | null; spike_count: string | null }>(sql`
      SELECT AVG(pool_price)::text AS avg_price,
             COUNT(*) FILTER (WHERE pool_price >= 200)::text AS spike_count
      FROM aeso_pool_price
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    `);
    const avgRow = avgResult.rows[0];

    const outageResult = await db.execute<{ active_mw: string | null; active_count: string | null }>(sql`
      SELECT COALESCE(SUM(mw_offline), 0)::text AS active_mw,
             COUNT(*)::text AS active_count
      FROM aeso_outages
      WHERE outage_end IS NULL OR outage_end > NOW()
    `);
    const outageRow = outageResult.rows[0];

    const queueResult = await db.execute<{ total_mw: string | null; project_count: string | null }>(sql`
      SELECT COALESCE(SUM(capacity_mw), 0)::text AS total_mw,
             COUNT(*)::text AS project_count
      FROM aeso_queue_projects
    `);
    const queueRow = queueResult.rows[0];

    const genResult = await db.execute<{ wind_pct: string | null; gas_pct: string | null }>(sql`
      SELECT
        (AVG(wind_mw) / NULLIF(AVG(total_mw), 0) * 100)::text AS wind_pct,
        (AVG(gas_mw) / NULLIF(AVG(total_mw), 0) * 100)::text AS gas_pct
      FROM aeso_generation_mix
      WHERE date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
        AND date < date_trunc('month', CURRENT_DATE)
    `);
    const genRow = genResult.rows[0];

    res.json({
      latestPoolPrice: priceRow?.latest_pool_price ? parseFloat(priceRow.latest_pool_price) : null,
      latestAilMw: priceRow?.latest_ail_mw ? parseFloat(priceRow.latest_ail_mw) : null,
      latestReserveMarginPct: reserveRow?.latest_reserve_margin_pct ? parseFloat(reserveRow.latest_reserve_margin_pct) : null,
      latestDate: priceRow?.latest_date ?? null,
      avgPriceLast30Days: avgRow?.avg_price ? parseFloat(avgRow.avg_price) : null,
      spikesLast30Days: avgRow?.spike_count ? parseInt(avgRow.spike_count) : 0,
      activeOutagesMw: outageRow?.active_mw ? parseFloat(outageRow.active_mw) : null,
      activeOutageCount: outageRow?.active_count ? parseInt(outageRow.active_count) : 0,
      queueTotalMw: queueRow?.total_mw ? parseFloat(queueRow.total_mw) : null,
      queueProjectCount: queueRow?.project_count ? parseInt(queueRow.project_count) : 0,
      windPctLastMonth: genRow?.wind_pct ? parseFloat(genRow.wind_pct) : null,
      gasPctLastMonth: genRow?.gas_pct ? parseFloat(genRow.gas_pct) : null,
    });
  } catch (err) {
    req.log.error({ err }, "getAesoDashboard error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Pool price time series
router.get("/aeso/pool-price", async (req, res) => {
  try {
    const { from, to, limit } = req.query as Record<string, string | undefined>;
    const lim = Math.min(parseInt(limit ?? "2000"), 8760);
    const rows = await db.execute<{
      id: number; date: string; hour_ending: number;
      pool_price: string | null; forecast_pool_price: string | null;
      ail_mw: string | null; net_gen_mw: string | null;
    }>(sql`
      SELECT id, date::text, hour_ending,
             pool_price::text, forecast_pool_price::text,
             ail_mw::text, net_gen_mw::text
      FROM aeso_pool_price
      WHERE (${from ?? null}::date IS NULL OR date >= ${from ?? null}::date)
        AND (${to ?? null}::date IS NULL OR date <= ${to ?? null}::date)
      ORDER BY date ASC, hour_ending ASC
      LIMIT ${lim}
    `);
    res.json(rows.rows.map(r => ({
      id: r.id,
      date: r.date,
      hourEnding: r.hour_ending,
      poolPrice: r.pool_price ? parseFloat(r.pool_price) : null,
      forecastPoolPrice: r.forecast_pool_price ? parseFloat(r.forecast_pool_price) : null,
      ailMw: r.ail_mw ? parseFloat(r.ail_mw) : null,
      netGenMw: r.net_gen_mw ? parseFloat(r.net_gen_mw) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoPoolPrice error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Monthly pool price stats
router.get("/aeso/pool-price/stats", async (req, res) => {
  try {
    const rows = await db.execute<{
      year: number; month: number;
      avg_price: string; min_price: string; max_price: string;
      spike_count: string; neg_count: string; volatility: string;
    }>(sql`
      SELECT
        EXTRACT(YEAR FROM date)::int AS year,
        EXTRACT(MONTH FROM date)::int AS month,
        AVG(pool_price)::text AS avg_price,
        MIN(pool_price)::text AS min_price,
        MAX(pool_price)::text AS max_price,
        COUNT(*) FILTER (WHERE pool_price >= 300)::text AS spike_count,
        COUNT(*) FILTER (WHERE pool_price < 0)::text AS neg_count,
        STDDEV(pool_price)::text AS volatility
      FROM aeso_pool_price
      WHERE pool_price IS NOT NULL
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);
    res.json(rows.rows.map(r => ({
      year: r.year,
      month: r.month,
      avgPrice: parseFloat(r.avg_price),
      minPrice: parseFloat(r.min_price),
      maxPrice: parseFloat(r.max_price),
      spikeCount: parseInt(r.spike_count),
      negCount: parseInt(r.neg_count),
      volatility: r.volatility ? parseFloat(r.volatility) : 0,
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoPoolPriceStats error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Pool price spike events
router.get("/aeso/pool-price/spikes", async (req, res) => {
  try {
    const { threshold, limit } = req.query as Record<string, string | undefined>;
    const thresh = parseFloat(threshold ?? "300");
    const lim = Math.min(parseInt(limit ?? "200"), 1000);
    const rows = await db.execute<{
      id: number; date: string; hour_ending: number;
      pool_price: string | null; forecast_pool_price: string | null;
      ail_mw: string | null; net_gen_mw: string | null;
    }>(sql`
      SELECT id, date::text, hour_ending,
             pool_price::text, forecast_pool_price::text,
             ail_mw::text, net_gen_mw::text
      FROM aeso_pool_price
      WHERE pool_price >= ${thresh}
      ORDER BY pool_price DESC
      LIMIT ${lim}
    `);
    res.json(rows.rows.map(r => ({
      id: r.id,
      date: r.date,
      hourEnding: r.hour_ending,
      poolPrice: r.pool_price ? parseFloat(r.pool_price) : null,
      forecastPoolPrice: r.forecast_pool_price ? parseFloat(r.forecast_pool_price) : null,
      ailMw: r.ail_mw ? parseFloat(r.ail_mw) : null,
      netGenMw: r.net_gen_mw ? parseFloat(r.net_gen_mw) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoPoolPriceSpikes error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Hourly generation mix
router.get("/aeso/generation", async (req, res) => {
  try {
    const { from, to, limit } = req.query as Record<string, string | undefined>;
    const lim = Math.min(parseInt(limit ?? "2000"), 8760);
    const rows = await db.execute<{
      id: number; date: string; hour_ending: number;
      gas_mw: string | null; coal_mw: string | null; wind_mw: string | null;
      solar_mw: string | null; hydro_mw: string | null; storage_mw: string | null;
      other_mw: string | null; total_mw: string | null;
    }>(sql`
      SELECT id, date::text, hour_ending,
             gas_mw::text, coal_mw::text, wind_mw::text,
             solar_mw::text, hydro_mw::text, storage_mw::text,
             other_mw::text, total_mw::text
      FROM aeso_generation_mix
      WHERE (${from ?? null}::date IS NULL OR date >= ${from ?? null}::date)
        AND (${to ?? null}::date IS NULL OR date <= ${to ?? null}::date)
      ORDER BY date ASC, hour_ending ASC
      LIMIT ${lim}
    `);
    res.json(rows.rows.map(r => ({
      id: r.id,
      date: r.date,
      hourEnding: r.hour_ending,
      gasMw: r.gas_mw ? parseFloat(r.gas_mw) : null,
      coalMw: r.coal_mw ? parseFloat(r.coal_mw) : null,
      windMw: r.wind_mw ? parseFloat(r.wind_mw) : null,
      solarMw: r.solar_mw ? parseFloat(r.solar_mw) : null,
      hydroMw: r.hydro_mw ? parseFloat(r.hydro_mw) : null,
      storageMw: r.storage_mw ? parseFloat(r.storage_mw) : null,
      otherMw: r.other_mw ? parseFloat(r.other_mw) : null,
      totalMw: r.total_mw ? parseFloat(r.total_mw) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoGeneration error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Monthly generation mix aggregates
router.get("/aeso/generation/monthly", async (req, res) => {
  try {
    const rows = await db.execute<{
      year: number; month: number;
      avg_gas_mw: string; avg_wind_mw: string; avg_solar_mw: string;
      avg_hydro_mw: string; avg_coal_mw: string; avg_total_mw: string;
    }>(sql`
      SELECT
        EXTRACT(YEAR FROM date)::int AS year,
        EXTRACT(MONTH FROM date)::int AS month,
        AVG(gas_mw)::text AS avg_gas_mw,
        AVG(wind_mw)::text AS avg_wind_mw,
        AVG(solar_mw)::text AS avg_solar_mw,
        AVG(hydro_mw)::text AS avg_hydro_mw,
        AVG(coal_mw)::text AS avg_coal_mw,
        AVG(total_mw)::text AS avg_total_mw
      FROM aeso_generation_mix
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);
    res.json(rows.rows.map(r => {
      const total = parseFloat(r.avg_total_mw) || 1;
      const wind = parseFloat(r.avg_wind_mw);
      const gas = parseFloat(r.avg_gas_mw);
      return {
        year: r.year,
        month: r.month,
        avgGasMw: gas,
        avgWindMw: wind,
        avgSolarMw: parseFloat(r.avg_solar_mw),
        avgHydroMw: parseFloat(r.avg_hydro_mw),
        avgCoalMw: parseFloat(r.avg_coal_mw),
        avgTotalMw: total,
        windPct: parseFloat(((wind / total) * 100).toFixed(1)),
        gasPct: parseFloat(((gas / total) * 100).toFixed(1)),
      };
    }));
  } catch (err) {
    req.log.error({ err }, "getAesoGenerationMonthly error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Hourly supply and demand
router.get("/aeso/supply-demand", async (req, res) => {
  try {
    const { from, to, limit } = req.query as Record<string, string | undefined>;
    const lim = Math.min(parseInt(limit ?? "2000"), 8760);
    const rows = await db.execute<{
      id: number; date: string; hour_ending: number;
      ail_mw: string | null; available_capacity_mw: string | null;
      reserve_margin_pct: string | null; bc_interchange_mw: string | null;
      sk_interchange_mw: string | null; net_interchange_mw: string | null;
    }>(sql`
      SELECT id, date::text, hour_ending,
             ail_mw::text, available_capacity_mw::text,
             reserve_margin_pct::text, bc_interchange_mw::text,
             sk_interchange_mw::text, net_interchange_mw::text
      FROM aeso_supply_demand
      WHERE (${from ?? null}::date IS NULL OR date >= ${from ?? null}::date)
        AND (${to ?? null}::date IS NULL OR date <= ${to ?? null}::date)
      ORDER BY date ASC, hour_ending ASC
      LIMIT ${lim}
    `);
    res.json(rows.rows.map(r => ({
      id: r.id,
      date: r.date,
      hourEnding: r.hour_ending,
      ailMw: r.ail_mw ? parseFloat(r.ail_mw) : null,
      availableCapacityMw: r.available_capacity_mw ? parseFloat(r.available_capacity_mw) : null,
      reserveMarginPct: r.reserve_margin_pct ? parseFloat(r.reserve_margin_pct) : null,
      bcInterchangeMw: r.bc_interchange_mw ? parseFloat(r.bc_interchange_mw) : null,
      skInterchangeMw: r.sk_interchange_mw ? parseFloat(r.sk_interchange_mw) : null,
      netInterchangeMw: r.net_interchange_mw ? parseFloat(r.net_interchange_mw) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoSupplyDemand error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Monthly supply/demand stats
router.get("/aeso/supply-demand/stats", async (req, res) => {
  try {
    const rows = await db.execute<{
      year: number; month: number;
      avg_ail_mw: string; peak_ail_mw: string;
      avg_reserve_margin_pct: string; min_reserve_margin_pct: string;
      avg_net_interchange_mw: string;
    }>(sql`
      SELECT
        EXTRACT(YEAR FROM date)::int AS year,
        EXTRACT(MONTH FROM date)::int AS month,
        AVG(ail_mw)::text AS avg_ail_mw,
        MAX(ail_mw)::text AS peak_ail_mw,
        AVG(reserve_margin_pct)::text AS avg_reserve_margin_pct,
        MIN(reserve_margin_pct)::text AS min_reserve_margin_pct,
        AVG(net_interchange_mw)::text AS avg_net_interchange_mw
      FROM aeso_supply_demand
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);
    res.json(rows.rows.map(r => ({
      year: r.year,
      month: r.month,
      avgAilMw: parseFloat(r.avg_ail_mw),
      peakAilMw: parseFloat(r.peak_ail_mw),
      avgReserveMarginPct: parseFloat(r.avg_reserve_margin_pct),
      minReserveMarginPct: parseFloat(r.min_reserve_margin_pct),
      avgNetInterchangeMw: parseFloat(r.avg_net_interchange_mw),
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoSupplyDemandStats error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Outage events
router.get("/aeso/outages", async (req, res) => {
  try {
    const { from, to, fuelType, limit } = req.query as Record<string, string | undefined>;
    const lim = Math.min(parseInt(limit ?? "500"), 2000);
    const rows = await db.execute<{
      id: number; facility: string; fuel_type: string | null;
      outage_type: string | null; outage_start: string; outage_end: string | null;
      mw_offline: string | null; reason: string | null; source: string | null;
      reported_at: string | null;
    }>(sql`
      SELECT id, facility, fuel_type, outage_type,
             outage_start::text, outage_end::text,
             mw_offline::text, reason, source, reported_at::text
      FROM aeso_outages
      WHERE (${from ?? null}::date IS NULL OR outage_start >= ${from ?? null}::date)
        AND (${to ?? null}::date IS NULL OR outage_start <= ${to ?? null}::date)
        AND (${fuelType ?? null}::text IS NULL OR fuel_type = ${fuelType ?? null})
      ORDER BY outage_start DESC
      LIMIT ${lim}
    `);
    res.json(rows.rows.map(r => ({
      id: r.id,
      facility: r.facility,
      fuelType: r.fuel_type,
      outageType: r.outage_type,
      outageStart: r.outage_start,
      outageEnd: r.outage_end,
      mwOffline: r.mw_offline ? parseFloat(r.mw_offline) : null,
      reason: r.reason,
      source: r.source,
      reportedAt: r.reported_at,
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoOutages error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Upcoming planned outages
router.get("/aeso/outages/upcoming", async (req, res) => {
  try {
    const rows = await db.execute<{
      id: number; facility: string; fuel_type: string | null;
      outage_type: string | null; outage_start: string; outage_end: string | null;
      mw_offline: string | null; reason: string | null; source: string | null;
      reported_at: string | null;
    }>(sql`
      SELECT id, facility, fuel_type, outage_type,
             outage_start::text, outage_end::text,
             mw_offline::text, reason, source, reported_at::text
      FROM aeso_outages
      WHERE outage_start >= CURRENT_DATE
        AND (outage_type = 'planned' OR outage_type = 'maintenance')
      ORDER BY outage_start ASC
      LIMIT 100
    `);
    res.json(rows.rows.map(r => ({
      id: r.id,
      facility: r.facility,
      fuelType: r.fuel_type,
      outageType: r.outage_type,
      outageStart: r.outage_start,
      outageEnd: r.outage_end,
      mwOffline: r.mw_offline ? parseFloat(r.mw_offline) : null,
      reason: r.reason,
      source: r.source,
      reportedAt: r.reported_at,
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoOutagesUpcoming error");
    res.status(500).json({ error: "internal_error" });
  }
});

// 7-day capability forecast
router.get("/aeso/7day-capability", async (req, res) => {
  try {
    const rows = await db.execute<{
      id: number; forecast_date: string; target_date: string; hour_ending: number;
      gas_mw: string | null; wind_mw: string | null; solar_mw: string | null;
      hydro_mw: string | null; storage_mw: string | null; other_mw: string | null;
      total_available_mw: string | null; ail_forecast_mw: string | null;
      reserve_margin_pct: string | null;
    }>(sql`
      SELECT id, forecast_date::text, target_date::text, hour_ending,
             gas_mw::text, wind_mw::text, solar_mw::text,
             hydro_mw::text, storage_mw::text, other_mw::text,
             total_available_mw::text, ail_forecast_mw::text, reserve_margin_pct::text
      FROM aeso_7day_capability
      WHERE forecast_date = (SELECT MAX(forecast_date) FROM aeso_7day_capability)
      ORDER BY target_date ASC, hour_ending ASC
    `);
    res.json(rows.rows.map(r => ({
      id: r.id,
      forecastDate: r.forecast_date,
      targetDate: r.target_date,
      hourEnding: r.hour_ending,
      gasMw: r.gas_mw ? parseFloat(r.gas_mw) : null,
      windMw: r.wind_mw ? parseFloat(r.wind_mw) : null,
      solarMw: r.solar_mw ? parseFloat(r.solar_mw) : null,
      hydroMw: r.hydro_mw ? parseFloat(r.hydro_mw) : null,
      storageMw: r.storage_mw ? parseFloat(r.storage_mw) : null,
      otherMw: r.other_mw ? parseFloat(r.other_mw) : null,
      totalAvailableMw: r.total_available_mw ? parseFloat(r.total_available_mw) : null,
      ailForecastMw: r.ail_forecast_mw ? parseFloat(r.ail_forecast_mw) : null,
      reserveMarginPct: r.reserve_margin_pct ? parseFloat(r.reserve_margin_pct) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "getAeso7dayCapability error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Interconnection queue
router.get("/aeso/queue", async (req, res) => {
  try {
    const { fuelType, region, status } = req.query as Record<string, string | undefined>;
    const rows = await db.execute<{
      id: number; project_name: string | null; fuel_type: string | null;
      capacity_mw: string | null; region: string | null; county: string | null;
      status: string | null; queue_date: string | null; expected_online: string | null;
      transmission_connection: string | null; lat: string | null; lng: string | null;
    }>(sql`
      SELECT id, project_name, fuel_type, capacity_mw::text, region, county,
             status, queue_date::text, expected_online::text,
             transmission_connection, lat::text, lng::text
      FROM aeso_queue_projects
      WHERE (${fuelType ?? null}::text IS NULL OR fuel_type = ${fuelType ?? null})
        AND (${region ?? null}::text IS NULL OR region = ${region ?? null})
        AND (${status ?? null}::text IS NULL OR status = ${status ?? null})
      ORDER BY queue_date DESC
    `);
    res.json(rows.rows.map(r => ({
      id: r.id,
      projectName: r.project_name,
      fuelType: r.fuel_type,
      capacityMw: r.capacity_mw ? parseFloat(r.capacity_mw) : null,
      region: r.region,
      county: r.county,
      status: r.status,
      queueDate: r.queue_date,
      expectedOnline: r.expected_online,
      transmissionConnection: r.transmission_connection,
      lat: r.lat ? parseFloat(r.lat) : null,
      lng: r.lng ? parseFloat(r.lng) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoQueue error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Queue stats
router.get("/aeso/queue/stats", async (req, res) => {
  try {
    const [byFuelType, byRegion, byStatus, totals] = await Promise.all([
      db.execute<{ fuel_type: string; count: string; total_mw: string }>(sql`
        SELECT COALESCE(fuel_type, 'Unknown') AS fuel_type,
               COUNT(*)::text AS count,
               COALESCE(SUM(capacity_mw), 0)::text AS total_mw
        FROM aeso_queue_projects
        GROUP BY 1
        ORDER BY 3::numeric DESC
      `),
      db.execute<{ region: string; count: string; total_mw: string }>(sql`
        SELECT COALESCE(region, 'Unknown') AS region,
               COUNT(*)::text AS count,
               COALESCE(SUM(capacity_mw), 0)::text AS total_mw
        FROM aeso_queue_projects
        GROUP BY 1
        ORDER BY 3::numeric DESC
      `),
      db.execute<{ status: string; count: string }>(sql`
        SELECT COALESCE(status, 'Unknown') AS status,
               COUNT(*)::text AS count
        FROM aeso_queue_projects
        GROUP BY 1
        ORDER BY 2::numeric DESC
      `),
      db.execute<{ total_projects: string; total_mw: string }>(sql`
        SELECT COUNT(*)::text AS total_projects,
               COALESCE(SUM(capacity_mw), 0)::text AS total_mw
        FROM aeso_queue_projects
      `),
    ]);

    res.json({
      byFuelType: byFuelType.rows.map(r => ({
        fuelType: r.fuel_type,
        count: parseInt(r.count),
        totalCapacityMw: parseFloat(r.total_mw),
      })),
      byRegion: byRegion.rows.map(r => ({
        region: r.region,
        count: parseInt(r.count),
        totalCapacityMw: parseFloat(r.total_mw),
      })),
      byStatus: byStatus.rows.map(r => ({
        status: r.status,
        count: parseInt(r.count),
      })),
      totalProjects: parseInt(totals.rows[0]?.total_projects ?? "0"),
      totalCapacityMw: parseFloat(totals.rows[0]?.total_mw ?? "0"),
    });
  } catch (err) {
    req.log.error({ err }, "getAesoQueueStats error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Constraint events
router.get("/aeso/constraints", async (req, res) => {
  try {
    const { from, to, corridor, limit } = req.query as Record<string, string | undefined>;
    const lim = Math.min(parseInt(limit ?? "500"), 2000);
    const rows = await db.execute<{
      id: number; event_date: string; hour_ending: number | null;
      constraint_type: string; corridor: string | null; facility: string | null;
      mw_constrained: string | null; cost_cad: string | null; reason: string | null;
    }>(sql`
      SELECT id, event_date::text, hour_ending, constraint_type,
             corridor, facility, mw_constrained::text, cost_cad::text, reason
      FROM aeso_constraint_events
      WHERE (${from ?? null}::date IS NULL OR event_date >= ${from ?? null}::date)
        AND (${to ?? null}::date IS NULL OR event_date <= ${to ?? null}::date)
        AND (${corridor ?? null}::text IS NULL OR corridor = ${corridor ?? null})
      ORDER BY event_date DESC, hour_ending ASC
      LIMIT ${lim}
    `);
    res.json(rows.rows.map(r => ({
      id: r.id,
      eventDate: r.event_date,
      hourEnding: r.hour_ending,
      constraintType: r.constraint_type,
      corridor: r.corridor,
      facility: r.facility,
      mwConstrained: r.mw_constrained ? parseFloat(r.mw_constrained) : null,
      costCad: r.cost_cad ? parseFloat(r.cost_cad) : null,
      reason: r.reason,
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoConstraints error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Actual vs forecast
router.get("/aeso/actual-forecast", async (req, res) => {
  try {
    const { from, to, limit } = req.query as Record<string, string | undefined>;
    const lim = Math.min(parseInt(limit ?? "2000"), 8760);
    const rows = await db.execute<{
      id: number; date: string; hour_ending: number;
      actual_pool_price: string | null; forecast_pool_price: string | null;
      price_forecast_error: string | null;
      actual_ail_mw: string | null; forecast_ail_mw: string | null;
      actual_wind_mw: string | null; forecast_wind_mw: string | null;
      wind_forecast_error_mw: string | null;
      actual_solar_mw: string | null; forecast_solar_mw: string | null;
      solar_forecast_error_mw: string | null; source: string | null;
    }>(sql`
      SELECT id, date::text, hour_ending,
             actual_pool_price::text, forecast_pool_price::text, price_forecast_error::text,
             actual_ail_mw::text, forecast_ail_mw::text,
             actual_wind_mw::text, forecast_wind_mw::text, wind_forecast_error_mw::text,
             actual_solar_mw::text, forecast_solar_mw::text, solar_forecast_error_mw::text,
             source
      FROM aeso_actual_forecast
      WHERE (${from ?? null}::date IS NULL OR date >= ${from ?? null}::date)
        AND (${to ?? null}::date IS NULL OR date <= ${to ?? null}::date)
      ORDER BY date ASC, hour_ending ASC
      LIMIT ${lim}
    `);
    res.json(rows.rows.map(r => ({
      id: r.id,
      date: r.date,
      hourEnding: r.hour_ending,
      actualPoolPrice: r.actual_pool_price ? parseFloat(r.actual_pool_price) : null,
      forecastPoolPrice: r.forecast_pool_price ? parseFloat(r.forecast_pool_price) : null,
      priceForecastError: r.price_forecast_error ? parseFloat(r.price_forecast_error) : null,
      actualAilMw: r.actual_ail_mw ? parseFloat(r.actual_ail_mw) : null,
      forecastAilMw: r.forecast_ail_mw ? parseFloat(r.forecast_ail_mw) : null,
      actualWindMw: r.actual_wind_mw ? parseFloat(r.actual_wind_mw) : null,
      forecastWindMw: r.forecast_wind_mw ? parseFloat(r.forecast_wind_mw) : null,
      windForecastErrorMw: r.wind_forecast_error_mw ? parseFloat(r.wind_forecast_error_mw) : null,
      actualSolarMw: r.actual_solar_mw ? parseFloat(r.actual_solar_mw) : null,
      forecastSolarMw: r.forecast_solar_mw ? parseFloat(r.forecast_solar_mw) : null,
      solarForecastErrorMw: r.solar_forecast_error_mw ? parseFloat(r.solar_forecast_error_mw) : null,
      source: r.source,
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoActualForecast error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Transmission corridors
router.get("/aeso/transmission-corridors", async (req, res) => {
  try {
    const rows = await db.execute<{
      id: number; corridor_name: string; from_region: string | null; to_region: string | null;
      voltage_kv: number | null; rating_mw: string | null; winter_rating_mw: string | null;
      summer_rating_mw: string | null; congestion_frequency_pct: string | null;
      avg_constrained_mw: string | null; notes: string | null;
    }>(sql`
      SELECT id, corridor_name, from_region, to_region, voltage_kv,
             rating_mw::text, winter_rating_mw::text, summer_rating_mw::text,
             congestion_frequency_pct::text, avg_constrained_mw::text, notes
      FROM aeso_transmission_corridors
      ORDER BY congestion_frequency_pct::numeric DESC NULLS LAST
    `);
    res.json(rows.rows.map(r => ({
      id: r.id,
      corridorName: r.corridor_name,
      fromRegion: r.from_region,
      toRegion: r.to_region,
      voltageKv: r.voltage_kv,
      ratingMw: r.rating_mw ? parseFloat(r.rating_mw) : null,
      winterRatingMw: r.winter_rating_mw ? parseFloat(r.winter_rating_mw) : null,
      summerRatingMw: r.summer_rating_mw ? parseFloat(r.summer_rating_mw) : null,
      congestionFrequencyPct: r.congestion_frequency_pct ? parseFloat(r.congestion_frequency_pct) : null,
      avgConstrainedMw: r.avg_constrained_mw ? parseFloat(r.avg_constrained_mw) : null,
      notes: r.notes,
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoTransmissionCorridors error");
    res.status(500).json({ error: "internal_error" });
  }
});

// SMP — system marginal price monthly history
router.get("/aeso/smp", async (req, res) => {
  try {
    const { from, to } = req.query as Record<string, string | undefined>;
    const rows = await db.execute<{
      month: string; avg_constrained: string | null; avg_unconstrained: string | null;
      avg_spread: string | null; max_spread: string | null; hours: string;
    }>(sql`
      SELECT DATE_TRUNC('month', date)::date::text AS month,
             AVG(constrained_price)::text   AS avg_constrained,
             AVG(unconstrained_price)::text AS avg_unconstrained,
             AVG(spread)::text              AS avg_spread,
             MAX(spread)::text              AS max_spread,
             COUNT(*)::text                 AS hours
      FROM aeso_smp
      WHERE (${from ?? null}::date IS NULL OR date >= ${from ?? null}::date)
        AND (${to   ?? null}::date IS NULL OR date <= ${to   ?? null}::date)
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY DATE_TRUNC('month', date)
    `);
    res.json(rows.rows.map(r => ({
      month:            r.month,
      avgConstrained:   r.avg_constrained   ? parseFloat(r.avg_constrained)   : null,
      avgUnconstrained: r.avg_unconstrained ? parseFloat(r.avg_unconstrained) : null,
      avgSpread:        r.avg_spread        ? parseFloat(r.avg_spread)        : null,
      maxSpread:        r.max_spread        ? parseFloat(r.max_spread)        : null,
      hours:            parseInt(r.hours, 10),
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoSmp error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Interchange — BC/SK actual + scheduled flows by month
router.get("/aeso/interchange", async (req, res) => {
  try {
    const { from, to } = req.query as Record<string, string | undefined>;
    const rows = await db.execute<{
      month: string; intertie_or_flowgate: string;
      avg_actual_mw: string | null; avg_scheduled_mw: string | null;
      max_actual_mw: string | null; min_actual_mw: string | null;
    }>(sql`
      SELECT DATE_TRUNC('month', date)::date::text AS month,
             intertie_or_flowgate,
             AVG(actual_mw)::text     AS avg_actual_mw,
             AVG(scheduled_mw)::text  AS avg_scheduled_mw,
             MAX(actual_mw)::text     AS max_actual_mw,
             MIN(actual_mw)::text     AS min_actual_mw
      FROM aeso_interchange
      WHERE (${from ?? null}::date IS NULL OR date >= ${from ?? null}::date)
        AND (${to   ?? null}::date IS NULL OR date <= ${to   ?? null}::date)
      GROUP BY DATE_TRUNC('month', date), intertie_or_flowgate
      ORDER BY DATE_TRUNC('month', date), intertie_or_flowgate
    `);
    res.json(rows.rows.map(r => ({
      month:               r.month,
      intertieOrFlowgate:  r.intertie_or_flowgate,
      avgActualMw:         r.avg_actual_mw     ? parseFloat(r.avg_actual_mw)     : null,
      avgScheduledMw:      r.avg_scheduled_mw  ? parseFloat(r.avg_scheduled_mw)  : null,
      maxActualMw:         r.max_actual_mw     ? parseFloat(r.max_actual_mw)     : null,
      minActualMw:         r.min_actual_mw     ? parseFloat(r.min_actual_mw)     : null,
    })));
  } catch (err) {
    req.log.error({ err }, "getAesoInterchange error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
