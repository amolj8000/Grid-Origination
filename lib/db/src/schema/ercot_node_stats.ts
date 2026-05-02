import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ercotNodeStatsTable = pgTable("ercot_node_stats", {
  id: serial("id").primaryKey(),
  node: text("node").notNull(),
  nodeType: text("node_type").notNull(), // hub, load_zone
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  avgDaPrice: numeric("avg_da_price", { precision: 10, scale: 4 }).notNull(),
  avgRtPrice: numeric("avg_rt_price", { precision: 10, scale: 4 }),
  volatility: numeric("volatility", { precision: 10, scale: 4 }),
  negPricePercent: numeric("neg_price_percent", { precision: 6, scale: 3 }),
  onPeakAvg: numeric("on_peak_avg", { precision: 10, scale: 4 }),
  offPeakAvg: numeric("off_peak_avg", { precision: 10, scale: 4 }),
  minPrice: numeric("min_price", { precision: 10, scale: 4 }),
  maxPrice: numeric("max_price", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertErcotNodeStatsSchema = createInsertSchema(ercotNodeStatsTable).omit({ id: true, createdAt: true });
export type InsertErcotNodeStats = z.infer<typeof insertErcotNodeStatsSchema>;
export type ErcotNodeStats = typeof ercotNodeStatsTable.$inferSelect;
