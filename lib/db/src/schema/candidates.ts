import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const candidatesTable = pgTable("candidates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  market: text("market").notNull(), // ERCOT, CAISO, PJM
  assetType: text("asset_type").notNull(), // solar, wind, storage, solar_storage, wind_storage
  status: text("status").notNull().default("active"), // active, inactive, under_review, contracted
  capacityMw: numeric("capacity_mw", { precision: 10, scale: 2 }).notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 10, scale: 6 }).notNull(),
  county: text("county"),
  state: text("state"),
  interconnectionNode: text("interconnection_node"),
  pricingHubNode: text("pricing_hub_node"),
  estimatedLcoe: numeric("estimated_lcoe", { precision: 8, scale: 2 }),
  offtakePriceMwh: numeric("offtake_price_mwh", { precision: 8, scale: 2 }),
  overallScore: numeric("overall_score", { precision: 5, scale: 2 }).notNull().default("0"),
  priceScore: numeric("price_score", { precision: 5, scale: 2 }),
  locationScore: numeric("location_score", { precision: 5, scale: 2 }),
  curtailmentScore: numeric("curtailment_score", { precision: 5, scale: 2 }),
  interconnectionScore: numeric("interconnection_score", { precision: 5, scale: 2 }),
  regulatoryScore: numeric("regulatory_score", { precision: 5, scale: 2 }),
  financialScore: numeric("financial_score", { precision: 5, scale: 2 }),
  environmentalScore: numeric("environmental_score", { precision: 5, scale: 2 }),
  gridStabilityScore: numeric("grid_stability_score", { precision: 5, scale: 2 }),
  demandProximityScore: numeric("demand_proximity_score", { precision: 5, scale: 2 }),
  developmentRiskScore: numeric("development_risk_score", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCandidateSchema = createInsertSchema(candidatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type Candidate = typeof candidatesTable.$inferSelect;
