export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { seedTestData } from "../../../../../prisma/seed";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  await seedTestData();
  return NextResponse.json({ ok: true });
}
