import { pgTable, serial, date, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aesoConstraintEventsTable = pgTable("aeso_constraint_events", {
  id: serial("id").primaryKey(),
  eventDate: date("event_date").notNull(),
  hourEnding: integer("hour_ending"),
  constraintType: text("constraint_type").notNull(),
  corridor: text("corridor"),
  facility: text("facility"),
  mwConstrained: numeric("mw_constrained", { precision: 10, scale: 2 }),
  costCad: numeric("cost_cad", { precision: 12, scale: 2 }),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAesoConstraintEventsSchema = createInsertSchema(aesoConstraintEventsTable).omit({ id: true, createdAt: true });
export type InsertAesoConstraintEvents = z.infer<typeof insertAesoConstraintEventsSchema>;
export type AesoConstraintEvents = typeof aesoConstraintEventsTable.$inferSelect;
