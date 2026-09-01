import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { queryRawSamples } from "@/db/telemetry";

const PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const page = Math.max(0, Number(req.nextUrl.searchParams.get("page") ?? 0) || 0);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") ?? PAGE_SIZE) || PAGE_SIZE),
  );

  const result = await queryRawSamples(page, pageSize);
  return NextResponse.json(result);
}
