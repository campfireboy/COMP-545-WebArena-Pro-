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
      username: z.string().min(3).regex(/^[a-zA-Z0-9_-]+$/),
    })
    .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, password, name, username } = parsed.data;

  const exists = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }],
    },
  });

  if (exists) {
    return NextResponse.json({ error: "Email or username already in use" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { email, username, name, password: hashPassword(password) },
  });

  return NextResponse.json({ id: user.id });
}
