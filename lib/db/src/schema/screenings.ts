import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const screeningsTable = pgTable("screenings", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  market: text("market").notNull(),
  assetType: text("asset_type").notNull(),
  objective: text("objective").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>(),
  candidateIds: jsonb("candidate_ids").$type<number[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScreeningSchema = createInsertSchema(screeningsTable).omit({ id: true, createdAt: true });
export type InsertScreening = z.infer<typeof insertScreeningSchema>;
export type Screening = typeof screeningsTable.$inferSelect;
