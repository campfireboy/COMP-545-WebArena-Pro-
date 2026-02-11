
import { startTransition } from "react";
import { NextResponse } from "next/server";
import { seedTestData } from "../../../../../prisma/seed";

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    console.log("Triggering database reset...");
    const result = await seedTestData();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Reset failed:", error);
    return NextResponse.json({ success: false, error: "Reset failed" }, { status: 500 });
  }
}
