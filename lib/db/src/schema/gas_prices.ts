import { pgTable, serial, text, numeric, date, index, uniqueIndex } from "drizzle-orm/pg-core";

export const gasPricesTable = pgTable("gas_prices", {
  id:             serial("id").primaryKey(),
  hub:            text("hub").notNull(),       // 'henry_hub' | 'waha'
  date:           date("date").notNull(),
  price:          numeric("price", { precision: 10, scale: 4 }),   // $/MMBtu
  source:         text("source"),              // 'fred' | 'eia'
}, (t) => [
  uniqueIndex("gas_prices_hub_date_uq").on(t.hub, t.date),
  index("gas_prices_hub_idx").on(t.hub),
  index("gas_prices_date_idx").on(t.date),
]);

export type GasPrice = typeof gasPricesTable.$inferSelect;
export type InsertGasPrice = typeof gasPricesTable.$inferInsert;
