import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pjmNodeStatsTable = pgTable("pjm_node_stats", {
  id: serial("id").primaryKey(),
  node: text("node").notNull(), // Western Hub, Eastern Hub, AEP-Dayton Hub, NI Hub, PSEG, PPL, DOM, BGE
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  avgDaPrice: numeric("avg_da_price", { precision: 10, scale: 4 }).notNull(),
  avgRtPrice: numeric("avg_rt_price", { precision: 10, scale: 4 }),
  volatility: numeric("volatility", { precision: 10, scale: 4 }),
  negPricePercent: numeric("neg_price_percent", { precision: 6, scale: 3 }),
  onPeakAvg: numeric("on_peak_avg", { precision: 10, scale: 4 }),
  offPeakAvg: numeric("off_peak_avg", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPjmNodeStatsSchema = createInsertSchema(pjmNodeStatsTable).omit({ id: true, createdAt: true });
export type InsertPjmNodeStats = z.infer<typeof insertPjmNodeStatsSchema>;
export type PjmNodeStats = typeof pjmNodeStatsTable.$inferSelect;
