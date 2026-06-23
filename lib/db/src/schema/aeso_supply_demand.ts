import { pgTable, serial, date, integer, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aesoSupplyDemandTable = pgTable("aeso_supply_demand", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  hourEnding: integer("hour_ending").notNull(),
  ailMw: numeric("ail_mw", { precision: 10, scale: 2 }),
  availableCapacityMw: numeric("available_capacity_mw", { precision: 10, scale: 2 }),
  reserveMarginPct: numeric("reserve_margin_pct", { precision: 6, scale: 2 }),
  bcInterchangeMw: numeric("bc_interchange_mw", { precision: 10, scale: 2 }),
  skInterchangeMw: numeric("sk_interchange_mw", { precision: 10, scale: 2 }),
  netInterchangeMw: numeric("net_interchange_mw", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique().on(t.date, t.hourEnding)]);

export const insertAesoSupplyDemandSchema = createInsertSchema(aesoSupplyDemandTable).omit({ id: true, createdAt: true });
export type InsertAesoSupplyDemand = z.infer<typeof insertAesoSupplyDemandSchema>;
export type AesoSupplyDemand = typeof aesoSupplyDemandTable.$inferSelect;
