import DriveView from "@/components/DriveView";

export default async function DriveFolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;
  return <DriveView folderId={folderId} />;
}
