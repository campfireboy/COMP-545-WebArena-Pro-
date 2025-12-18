export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { seedTestData } from "../../../../../prisma/seed";

export async function POST() {
  try {
    // Just seed the database with folders
    const seedResult = await seedTestData();

    return NextResponse.json({
      ok: true,
      message: "Database reset successfully",
      user: seedResult.userEmail
    });
  } catch (error) {
    console.error("Reset error:", error);
    return NextResponse.json({
      error: "Reset failed",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
