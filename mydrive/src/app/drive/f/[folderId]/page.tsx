import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import DriveView from "@/components/DriveView";

export default async function DriveFolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/login");
  }

  const { folderId } = await params;
  return <DriveView folderId={folderId} />;
}
