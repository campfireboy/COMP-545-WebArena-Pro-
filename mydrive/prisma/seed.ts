import { prisma } from "../src/lib/db";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime";

// Initialize S3 Client locally for seeding
const s3 = new S3Client({
  region: process.env.S3_REGION!,
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
});

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function seedTestData() {
  const inputMaterialsPath = path.join(process.cwd(), "InputMaterials");

  if (!fs.existsSync(inputMaterialsPath)) {
    console.log("No InputMaterials directory found, creating default.");
    fs.mkdirSync(inputMaterialsPath, { recursive: true });
    // create d1/d2 for demo if empty? keeping it simple for now.
  }

  // Get directories d1, d2, ...
  const entries = fs.readdirSync(inputMaterialsPath, { withFileTypes: true });
  const agentDirs = entries
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort(); // d1, d2... (alphanumeric sort)

  console.log(`Found agent directories: ${agentDirs.join(", ")}`);

  const createdUsers = [];

  for (let i = 0; i < agentDirs.length; i++) {
    const dirName = agentDirs[i];
    const agentIndex = i + 1; // 1-based index
    const email = `agent${agentIndex}@test${agentIndex}.com`;
    const username = `agent${agentIndex}`;
    const name = `Agent${agentIndex} Test${agentIndex}`;

    console.log(`Processing ${username} (${email}) from ${dirName}...`);

    // 1. Cleanup existing user
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (existingUser) {
      console.log(`Deleting existing user ${existingUser.id}...`);
      await prisma.share.deleteMany({ where: { ownerId: existingUser.id } });
      await prisma.share.deleteMany({ where: { sharedWithUserId: existingUser.id } });
      await prisma.fileObject.deleteMany({ where: { ownerId: existingUser.id } });
      await prisma.folder.deleteMany({ where: { ownerId: existingUser.id } });
      const deleted = await prisma.user.deleteMany({ where: { email } });
      console.log(`Deleted user count: ${deleted.count}`);
    }

    // 2. Create User
    const user = await prisma.user.create({
      data: {
        email,
        username,
        id: `user-${username}`,
        name,
        password: hashPassword("password123"),
      },
    });
    console.log(`[DEBUG] Seeded user: ${user.username} with ID: ${user.id}`);
    createdUsers.push(user);

    // 3. Upload Content
    const agentRootPath = path.join(inputMaterialsPath, dirName);
    if (fs.existsSync(agentRootPath)) {
      console.log(`Uploading content from ${agentRootPath}...`);
      await uploadRecursive(agentRootPath, null, user.id);
    }
  }

  return {
    message: "Seeding complete",
    users: createdUsers.map(u => ({ email: u.email, id: u.id }))
  };
}

// Helper to upload recursive
async function uploadRecursive(currentFsPath: string, parentFolderId: string | null, userId: string) {
  const items = fs.readdirSync(currentFsPath, { withFileTypes: true });
  for (const item of items) {
    const itemPath = path.join(currentFsPath, item.name);
    if (item.isDirectory()) {
      const folder = await prisma.folder.create({
        data: { name: item.name, ownerId: userId, parentId: parentFolderId }
      });
      await uploadRecursive(itemPath, folder.id, userId);
    } else {
      const content = fs.readFileSync(itemPath);
      await uploadFile(userId, parentFolderId, item.name, content);
    }
  }
}

// Helper to create text file
async function createTextFile(userId: string, folderId: string | null, name: string, content: string) {
  await uploadFile(userId, folderId, name, Buffer.from(content));
}

// Helper to upload file to S3 and DB
async function uploadFile(userId: string, folderId: string | null, name: string, content: Buffer) {
  const s3Key = `${userId}/${crypto.randomUUID()}-${name}`;
  const mimeType = mime.getType(name) || "application/octet-stream";

  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: s3Key,
    Body: content,
    ContentType: mimeType
  }));

  await prisma.fileObject.create({
    data: {
      name,
      size: content.length,
      mimeType,
      s3Key,
      ownerId: userId,
      folderId
    }
  });
}



async function main() {
  await seedTestData();
}

if (require.main === module) {
  main()
    .then(async () => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
