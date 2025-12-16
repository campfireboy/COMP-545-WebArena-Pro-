import { prisma } from "../src/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export async function seedTestData() {
  // Wipe data in a safe order (depends on your schema relations)
  await prisma.share?.deleteMany().catch(() => {});
  await prisma.fileObject?.deleteMany().catch(() => {});
  await prisma.folder?.deleteMany().catch(() => {});
  await prisma.user?.deleteMany().catch(() => {});
  


  // Create dummy user
  //const passwordHash = await bcrypt.hash("password123", 10);
  function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}


  const user = await prisma.user.create({
  data: {
    email: "agent@test.com",
    name: "Agent User",
    password: hashPassword("password123"),
  },
});

  // Root-level folders
  const coursework = await prisma.folder.create({
    data: { name: "Coursework", ownerId: user.id, parentId: null },
  });

  const ml = await prisma.folder.create({
    data: { name: "ML Capstone", ownerId: user.id, parentId: null },
  });

  const personal = await prisma.folder.create({
    data: { name: "Personal Admin", ownerId: user.id, parentId: null },
  });

  // Subfolders
  const poli340 = await prisma.folder.create({
    data: { name: "POLI 340", ownerId: user.id, parentId: coursework.id },
  });

  const comp545 = await prisma.folder.create({
    data: { name: "COMP 545", ownerId: user.id, parentId: coursework.id },
  });

  const experiments = await prisma.folder.create({
    data: { name: "Experiments", ownerId: user.id, parentId: ml.id },
  });

  // Dummy files (DB records only — no S3 needed)
  // If your FileObject model requires different fields, adjust these.
  await prisma.fileObject.createMany({
    data: [
      {
        name: "POLI340_essay_outline.docx",
        ownerId: user.id,
        folderId: poli340.id,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 142321,
        s3Key: "dummy/poli340-outline.docx",
      },
      {
        name: "a3_notes.txt",
        ownerId: user.id,
        folderId: comp545.id,
        mimeType: "text/plain",
        size: 4280,
        s3Key: "dummy/a3-notes.txt",
      },
      {
        name: "ablation_runs.csv",
        ownerId: user.id,
        folderId: experiments.id,
        mimeType: "text/csv",
        size: 91822,
        s3Key: "dummy/ablation_runs.csv",
      },
    ],
  });

  return { userEmail: user.email };
}

async function main() {
  await seedTestData();
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
