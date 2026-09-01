import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { signTicket } from "@/lib/ws-ticket";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ticket: signTicket() });
}
