import { pgTable, serial, date, integer, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aeso7dayCapabilityTable = pgTable("aeso_7day_capability", {
  id: serial("id").primaryKey(),
  forecastDate: date("forecast_date").notNull(),
  targetDate: date("target_date").notNull(),
  hourEnding: integer("hour_ending").notNull(),
  gasMw: numeric("gas_mw", { precision: 10, scale: 2 }),
  windMw: numeric("wind_mw", { precision: 10, scale: 2 }),
  solarMw: numeric("solar_mw", { precision: 10, scale: 2 }),
  hydroMw: numeric("hydro_mw", { precision: 10, scale: 2 }),
  storageMw: numeric("storage_mw", { precision: 10, scale: 2 }),
  otherMw: numeric("other_mw", { precision: 10, scale: 2 }),
  totalAvailableMw: numeric("total_available_mw", { precision: 10, scale: 2 }),
  ailForecastMw: numeric("ail_forecast_mw", { precision: 10, scale: 2 }),
  reserveMarginPct: numeric("reserve_margin_pct", { precision: 6, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique().on(t.forecastDate, t.targetDate, t.hourEnding)]);

export const insertAeso7dayCapabilitySchema = createInsertSchema(aeso7dayCapabilityTable).omit({ id: true, createdAt: true });
export type InsertAeso7dayCapability = z.infer<typeof insertAeso7dayCapabilitySchema>;
export type Aeso7dayCapability = typeof aeso7dayCapabilityTable.$inferSelect;
