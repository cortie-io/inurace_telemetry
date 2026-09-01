import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { queryHistory } from "@/db/telemetry";

const MAX_RANGE_MS = 3 * 30 * 24 * 60 * 60 * 1000; // matches the 3-month retention window

// Accepts either a relative window (?rangeMs=) or an absolute one (?from=&to=, epoch ms) —
// the History tab's preset buttons use the former, the custom date/time picker the latter.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");

  let from: Date;
  let to: Date;

  if (fromParam && toParam) {
    from = new Date(Number(fromParam));
    to = new Date(Number(toParam));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return NextResponse.json({ error: "invalid from/to" }, { status: 400 });
    }
  } else {
    const rangeMs = Number(req.nextUrl.searchParams.get("rangeMs"));
    if (!Number.isFinite(rangeMs) || rangeMs <= 0) {
      return NextResponse.json({ error: "invalid rangeMs" }, { status: 400 });
    }
    to = new Date();
    from = new Date(to.getTime() - rangeMs);
  }

  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return NextResponse.json({ error: "range too large" }, { status: 400 });
  }

  const result = await queryHistory(from, to);
  return NextResponse.json(result);
}
