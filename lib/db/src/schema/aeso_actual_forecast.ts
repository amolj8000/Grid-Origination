import { pgTable, serial, date, integer, numeric, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aesoActualForecastTable = pgTable("aeso_actual_forecast", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  hourEnding: integer("hour_ending").notNull(),
  actualPoolPrice: numeric("actual_pool_price", { precision: 10, scale: 4 }),
  forecastPoolPrice: numeric("forecast_pool_price", { precision: 10, scale: 4 }),
  priceForecastError: numeric("price_forecast_error", { precision: 10, scale: 4 }),
  actualAilMw: numeric("actual_ail_mw", { precision: 10, scale: 2 }),
  forecastAilMw: numeric("forecast_ail_mw", { precision: 10, scale: 2 }),
  actualWindMw: numeric("actual_wind_mw", { precision: 10, scale: 2 }),
  forecastWindMw: numeric("forecast_wind_mw", { precision: 10, scale: 2 }),
  windForecastErrorMw: numeric("wind_forecast_error_mw", { precision: 10, scale: 2 }),
  actualSolarMw: numeric("actual_solar_mw", { precision: 10, scale: 2 }),
  forecastSolarMw: numeric("forecast_solar_mw", { precision: 10, scale: 2 }),
  solarForecastErrorMw: numeric("solar_forecast_error_mw", { precision: 10, scale: 2 }),
  source: text("source"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique().on(t.date, t.hourEnding)]);

export const insertAesoActualForecastSchema = createInsertSchema(aesoActualForecastTable).omit({ id: true, createdAt: true });
export type InsertAesoActualForecast = z.infer<typeof insertAesoActualForecastSchema>;
export type AesoActualForecast = typeof aesoActualForecastTable.$inferSelect;
