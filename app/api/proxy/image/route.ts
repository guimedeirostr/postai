import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";

/**
 * Image proxy — fetches any R2/external image server-side and returns it
 * with proper CORS headers so the HTML Canvas can draw it without tainting.
 *
 * GET /api/proxy/image?url=<encoded_image_url>
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return new NextResponse("Missing url param", { status: 400 });

  let url: string;
  try {
    url = decodeURIComponent(raw);
    // Basic safety: must be http/https
    if (!/^https?:\/\//i.test(url)) throw new Error("invalid");
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "PostAI-Proxy/1.0" },
    });

    if (!upstream.ok) {
      return new NextResponse(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
      });
    }

    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":                contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control":               "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch error";
    return new NextResponse(msg, { status: 502 });
  }
}
