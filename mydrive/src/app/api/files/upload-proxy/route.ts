import { NextResponse } from "next/server";

export async function PUT(req: Request) {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
        return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    try {
        const headers: Record<string, string> = {
            "Content-Type": req.headers.get("content-type") || "application/octet-stream",
        };
        const sizeParam = url.searchParams.get("size");
        const contentLength = req.headers.get("content-length") || sizeParam;
        if (contentLength) {
            headers["Content-Length"] = contentLength;
        }

        const response = await fetch(targetUrl, {
            method: "PUT",
            body: req.body,
            headers,
            // @ts-ignore
            duplex: "half"
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("S3 Upload Failed:", text);
            return NextResponse.json({ error: "Upload failed to S3" }, { status: response.status });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Proxy error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
