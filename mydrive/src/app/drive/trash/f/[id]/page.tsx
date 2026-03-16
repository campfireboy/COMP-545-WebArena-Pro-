import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import DriveView from "@/components/DriveView";

export default async function TrashedFolderPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        redirect("/login");
    }

    const { id } = await params;

    return <DriveView folderId={id} viewType="trash" />;
}
