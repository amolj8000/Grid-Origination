import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const queueProjectsTable = pgTable("queue_projects", {
  id: serial("id").primaryKey(),
  projectName: text("project_name").notNull(),
  market: text("market").notNull(), // ERCOT, CAISO, PJM
  queueId: text("queue_id"),
  fuelType: text("fuel_type").notNull(), // solar, wind, storage, hybrid, natural_gas
  capacityMw: numeric("capacity_mw", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull(), // active, withdrawn, completed, suspended
  latitude: numeric("latitude", { precision: 10, scale: 6 }),
  longitude: numeric("longitude", { precision: 10, scale: 6 }),
  county: text("county"),
  state: text("state"),
  interconnectionNode: text("interconnection_node"),
  requestDate: timestamp("request_date"),
  studyGroupPhase: text("study_group_phase"),
  withdrawalDate: timestamp("withdrawal_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertQueueProjectSchema = createInsertSchema(queueProjectsTable).omit({ id: true, createdAt: true });
export type InsertQueueProject = z.infer<typeof insertQueueProjectSchema>;
export type QueueProject = typeof queueProjectsTable.$inferSelect;
