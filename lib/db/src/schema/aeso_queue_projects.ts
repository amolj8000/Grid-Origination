import { pgTable, serial, text, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aesoQueueProjectsTable = pgTable("aeso_queue_projects", {
  id: serial("id").primaryKey(),
  projectName: text("project_name"),
  fuelType: text("fuel_type"),
  capacityMw: numeric("capacity_mw", { precision: 10, scale: 2 }),
  region: text("region"),
  county: text("county"),
  status: text("status"),
  queueDate: date("queue_date"),
  expectedOnline: date("expected_online"),
  transmissionConnection: text("transmission_connection"),
  lat: numeric("lat", { precision: 10, scale: 6 }),
  lng: numeric("lng", { precision: 10, scale: 6 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAesoQueueProjectsSchema = createInsertSchema(aesoQueueProjectsTable).omit({ id: true, createdAt: true });
export type InsertAesoQueueProjects = z.infer<typeof insertAesoQueueProjectsSchema>;
export type AesoQueueProjects = typeof aesoQueueProjectsTable.$inferSelect;
