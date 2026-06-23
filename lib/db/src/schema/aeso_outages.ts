import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aesoOutagesTable = pgTable("aeso_outages", {
  id: serial("id").primaryKey(),
  facility: text("facility").notNull(),
  fuelType: text("fuel_type"),
  outageType: text("outage_type"),
  outageStart: timestamp("outage_start").notNull(),
  outageEnd: timestamp("outage_end"),
  mwOffline: numeric("mw_offline", { precision: 10, scale: 2 }),
  reason: text("reason"),
  source: text("source"),
  reportedAt: timestamp("reported_at").defaultNow(),
});

export const insertAesoOutagesSchema = createInsertSchema(aesoOutagesTable).omit({ id: true, reportedAt: true });
export type InsertAesoOutages = z.infer<typeof insertAesoOutagesSchema>;
export type AesoOutages = typeof aesoOutagesTable.$inferSelect;
