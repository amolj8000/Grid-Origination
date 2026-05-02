import { Router } from "express";
import { db, candidatesTable, queueProjectsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array required" });
      return;
    }

    const candidates = await db.select().from(candidatesTable).limit(20);
    const queueProjects = await db.select().from(queueProjectsTable).limit(20);

    const totalMw = candidates.reduce((s, c) => s + Number(c.capacityMw), 0);
    const avgScore = candidates.length
      ? (candidates.reduce((s, c) => s + Number(c.overallScore), 0) / candidates.length).toFixed(1)
      : "N/A";

    const topCandidates = [...candidates]
      .sort((a, b) => Number(b.overallScore) - Number(a.overallScore))
      .slice(0, 6)
      .map(c => `  - ${c.name} | ${c.market} | ${c.assetType} | ${c.capacityMw} MW | score: ${Number(c.overallScore).toFixed(1)} | ${c.status}`)
      .join("\n");

    const queueSummary = queueProjects
      .slice(0, 8)
      .map(q => `  - ${q.projectName} | ${q.market} | ${q.fuelType} | ${q.capacityMw} MW | ${q.status}`)
      .join("\n");

    const systemPrompt = `You are the Grid Origination Copilot — an expert AI assistant for power market siting and energy procurement across ERCOT, CAISO, and PJM.

CURRENT PLATFORM DATA (live):
Pipeline: ${candidates.length} candidates | ${totalMw.toLocaleString()} MW total | avg score ${avgScore}

Top Candidates by Score:
${topCandidates}

Recent Queue Projects:
${queueSummary}

EXPERTISE:
- Nodal basis risk, DA/RT price spreads, negative price frequency
- Interconnection queue dynamics, study milestones, withdrawal patterns
- LCOE estimation, capacity factor, curtailment proxies
- ERCOT hub/load zone pricing (HB_HOUSTON, HB_NORTH, HB_SOUTH, HB_WEST, LZ zones)
- CAISO pricing hubs (NP15, SP15, ZP26)
- PJM energy market fundamentals
- Origination scoring across: price attractiveness, location quality, curtailment risk, interconnection complexity, financial viability

When asked about specific candidates or nodes, use the platform data above. Be concise, direct, and quantitative. Use energy industry terminology naturally.`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "chat error");
    res.write(`data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`);
    res.end();
  }
});

export default router;
