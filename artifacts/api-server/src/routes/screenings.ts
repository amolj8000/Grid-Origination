import { Router } from "express";
import { db, screeningsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateScreeningBody,
  GetScreeningParams,
  DeleteScreeningParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/screenings", async (req, res) => {
  try {
    const rows = await db.select().from(screeningsTable).orderBy(screeningsTable.createdAt);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "listScreenings error");
    res.status(500).json({ error: "internal_error", message: "Failed to list screenings" });
  }
});

router.post("/screenings", async (req, res) => {
  try {
    const parsed = CreateScreeningBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", message: parsed.error.message });
      return;
    }
    const [row] = await db.insert(screeningsTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "createScreening error");
    res.status(500).json({ error: "internal_error", message: "Failed to create screening" });
  }
});

router.get("/screenings/:id", async (req, res) => {
  try {
    const parsed = GetScreeningParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id", message: parsed.error.message });
      return;
    }
    const [row] = await db.select().from(screeningsTable).where(eq(screeningsTable.id, parsed.data.id));
    if (!row) {
      res.status(404).json({ error: "not_found", message: "Screening not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "getScreening error");
    res.status(500).json({ error: "internal_error", message: "Failed to get screening" });
  }
});

router.delete("/screenings/:id", async (req, res) => {
  try {
    const parsed = DeleteScreeningParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id", message: parsed.error.message });
      return;
    }
    await db.delete(screeningsTable).where(eq(screeningsTable.id, parsed.data.id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "deleteScreening error");
    res.status(500).json({ error: "internal_error", message: "Failed to delete screening" });
  }
});

export default router;
