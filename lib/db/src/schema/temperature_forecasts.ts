import { pgTable, serial, varchar, smallint, real, unique } from "drizzle-orm/pg-core";

export const temperatureForecasts = pgTable(
  "temperature_forecasts",
  {
    id:        serial("id").primaryKey(),
    iso:       varchar("iso",   { length: 10  }).notNull(),
    zone:      varchar("zone",  { length: 20  }).notNull(),
    year:      smallint("year").notNull(),
    month:     smallint("month").notNull(),
    day:       smallint("day").notNull(),
    tempMeanF: real("temp_mean_f").notNull(),
    tempMinF:  real("temp_min_f").notNull(),
    tempMaxF:  real("temp_max_f").notNull(),
    model:     varchar("model", { length: 50  }).notNull().default("MRI_AGCM3_2_S"),
  },
  (t) => [unique("temperature_forecasts_uniq").on(t.iso, t.zone, t.year, t.month, t.day)],
);
