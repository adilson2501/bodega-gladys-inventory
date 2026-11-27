import { desc, eq } from "drizzle-orm";
import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { predictionAudits, products } from "@/db/schema";
import { getAuth } from "@/lib/auth/server";
import { hasAuthenticatedUser } from "@/lib/auth/route-guard";
import { APF3_CUTOFF, createPrediction, modelFingerprint } from "@/lib/apf3/runtime";

const inputSchema = z.object({ productId: z.string().uuid(), cutoffDate: z.string().date().default(APF3_CUTOFF) });

async function authorized() { const { data } = await getAuth().getSession(); return hasAuthenticatedUser(data as unknown as { user?: unknown } | null); }

export async function GET() {
  await connection();
  if (!(await authorized())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const history = await db.select({ id: predictionAudits.id, productId: predictionAudits.productId, productName: products.name, predictedAt: predictionAudits.predictedAt, status: predictionAudits.status, output: predictionAudits.output, errorDetails: predictionAudits.errorDetails, modelVersion: predictionAudits.modelVersion }).from(predictionAudits).innerJoin(products, eq(predictionAudits.productId, products.id)).where(eq(predictionAudits.origin, "SYNTHETIC")).orderBy(desc(predictionAudits.predictedAt)).limit(20);
  return NextResponse.json({ history });
}

export async function POST(request: Request) {
  await connection();
  if (!(await authorized())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  let parsed: z.infer<typeof inputSchema>;
  try { parsed = inputSchema.parse(await request.json()); } catch { return NextResponse.json({ error: "Producto o fecha inválidos." }, { status: 400 }); }
  const modelHash = await modelFingerprint().catch(() => "unavailable");
  try {
    const result = await createPrediction(parsed.productId, parsed.cutoffDate);
    const [audit] = await db.insert(predictionAudits).values({ productId: parsed.productId, inputSnapshot: result.record, output: result.prediction, modelVersion: result.modelVersion, modelHash: result.modelHash, origin: "SYNTHETIC", status: "SUCCESS" }).returning({ id: predictionAudits.id });
    return NextResponse.json({ ...result.prediction, auditId: audit.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de inferencia.";
    await db.insert(predictionAudits).values({ productId: parsed.productId, inputSnapshot: { product_id: parsed.productId, date: parsed.cutoffDate, source: "SYNTHETIC" }, output: null, modelVersion: "apf3-models-1.1", modelHash, origin: "SYNTHETIC", status: "FAILURE", errorDetails: message });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
