import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { queryRawSamplesInRange } from "@/db/telemetry";

const MAX_RANGE_MS = 3 * 30 * 24 * 60 * 60 * 1000; // matches the 3-month retention window

const CSV_HEADER =
  "time,deviceKey,sessionId,steeringAngle,brakeFront,brakeRear,speed,batteryTemp,batteryVoltage,batteryCurrent,kw,rtd,precharge";

function toCsvRow(r: Awaited<ReturnType<typeof queryRawSamplesInRange>>[number]): string {
  const kw = (r.batteryVoltage * r.batteryCurrent) / 1000;
  // Every field here is numeric/boolean/ISO-timestamp or a device key we generate ourselves —
  // no free-text user input ever lands in this table, so there's nothing that needs quoting or
  // escaping for CSV.
  return [
    new Date(r.time).toISOString(),
    r.deviceKey,
    r.sessionId ?? "",
    r.steeringAngle,
    r.brakeFront,
    r.brakeRear,
    r.speed,
    r.batteryTemp,
    r.batteryVoltage,
    r.batteryCurrent,
    kw.toFixed(3),
    r.rtd ? "1" : "0",
    r.precharge ? "1" : "0",
  ].join(",");
}

// Exports raw telemetry_samples rows for a Lab View time range as a downloadable CSV — the
// same {from,to} model Lab View already uses for its chart/stats fetch, so this works for a
// whole session or a single Lab Time mark alike.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const from = new Date(Number(fromParam));
  const to = new Date(Number(toParam));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return NextResponse.json({ error: "invalid from/to" }, { status: 400 });
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return NextResponse.json({ error: "range too large" }, { status: 400 });
  }

  const rows = await queryRawSamplesInRange(from, to);
  const csv = [CSV_HEADER, ...rows.map(toCsvRow)].join("\n") + "\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="telemetry_${from.getTime()}_${to.getTime()}.csv"`,
    },
  });
}
