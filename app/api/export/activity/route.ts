import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const project_id = searchParams.get("project_id");
  if (!project_id) return NextResponse.json({ error: "project_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("activity_logs")
    .select("created_at, action, payload, actor_id, profiles:actor_id(username)")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = (data || []).map((l: any, i) => ({
    ลำดับ: i + 1,
    "เวลา": new Date(l.created_at).toLocaleString("th-TH"),
    "ผู้กระทำ": l.profiles?.username || l.actor_id,
    action: l.action,
    "รายละเอียด": JSON.stringify(l.payload),
  }));
  const csv = Papa.unparse(rows);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity_${today}.csv"`,
    },
  });
}
