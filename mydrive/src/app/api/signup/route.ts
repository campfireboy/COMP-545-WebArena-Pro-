import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = z
    .object({
      email: z.string().email(),
      password: z.string().min(6),
      name: z.string().min(1).optional(),
    })
    .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, password, name } = parsed.data;

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { email, name, password: hashPassword(password) },
  });

  // Optional: create a root folder record or leave root as "null parentId"
  return NextResponse.json({ id: user.id });
}
