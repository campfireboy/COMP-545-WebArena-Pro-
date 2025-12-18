import { prisma } from "../src/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export async function seedTestData() {
  // Find agent user if exists
  const agentUser = await prisma.user.findUnique({
    where: { email: "agent@test.com" },
    select: { id: true },
  });

  // Delete only agent user's data
  if (agentUser) {
    await prisma.share.deleteMany({ where: { ownerId: agentUser.id } });
    await prisma.fileObject.deleteMany({ where: { ownerId: agentUser.id } });
    await prisma.folder.deleteMany({ where: { ownerId: agentUser.id } });
    await prisma.user.delete({ where: { id: agentUser.id } }).catch(() => { });
  }



  // Create dummy user
  //const passwordHash = await bcrypt.hash("password123", 10);
  function hashPassword(password: string) {
    return crypto.createHash("sha256").update(password).digest("hex");
  }


  const user = await prisma.user.create({
    data: {
      email: "agent@test.com",
      name: "Agent User",
      username: "agent123",
      password: hashPassword("password123"),
    },
  });

  // Root-level folders
  // Folder 1: "Input Material" - has 2 subfolders
  const inputMaterial = await prisma.folder.create({
    data: { name: "Input Material", ownerId: user.id, parentId: null },
  });

  // Folder 2: "Research Notes" - has 1 subfolder
  const researchNotes = await prisma.folder.create({
    data: { name: "Research Notes", ownerId: user.id, parentId: null },
  });

  // Folder 3: "Archive" - has no subfolders (leaf folder)
  const archive = await prisma.folder.create({
    data: { name: "Archive", ownerId: user.id, parentId: null },
  });

  // Subfolders for Input Material (2 subfolders)
  const rawData = await prisma.folder.create({
    data: { name: "Raw Data", ownerId: user.id, parentId: inputMaterial.id },
  });

  const processedData = await prisma.folder.create({
    data: { name: "Processed Data", ownerId: user.id, parentId: inputMaterial.id },
  });

  // Subfolder for Research Notes (1 subfolder)
  const literature = await prisma.folder.create({
    data: { name: "Literature Review", ownerId: user.id, parentId: researchNotes.id },
  });

  // Return folder structure for use by reset API
  return {
    userEmail: user.email,
    userId: user.id,
    folders: {
      inputMaterial: inputMaterial.id,
      researchNotes: researchNotes.id,
      archive: archive.id,
      rawData: rawData.id,
      processedData: processedData.id,
      literature: literature.id,
    }
  };
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
