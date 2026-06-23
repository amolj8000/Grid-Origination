import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aesoTransmissionCorridorsTable = pgTable("aeso_transmission_corridors", {
  id: serial("id").primaryKey(),
  corridorName: text("corridor_name").notNull(),
  fromRegion: text("from_region"),
  toRegion: text("to_region"),
  voltageKv: integer("voltage_kv"),
  ratingMw: numeric("rating_mw", { precision: 10, scale: 2 }),
  winterRatingMw: numeric("winter_rating_mw", { precision: 10, scale: 2 }),
  summerRatingMw: numeric("summer_rating_mw", { precision: 10, scale: 2 }),
  congestionFrequencyPct: numeric("congestion_frequency_pct", { precision: 6, scale: 2 }),
  avgConstrainedMw: numeric("avg_constrained_mw", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAesoTransmissionCorridorsSchema = createInsertSchema(aesoTransmissionCorridorsTable).omit({ id: true, createdAt: true });
export type InsertAesoTransmissionCorridors = z.infer<typeof insertAesoTransmissionCorridorsSchema>;
export type AesoTransmissionCorridors = typeof aesoTransmissionCorridorsTable.$inferSelect;
