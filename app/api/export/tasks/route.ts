import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { createServerSupabase } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const project_id = searchParams.get("project_id");
  const statuses = (searchParams.get("status") || "TODO,DOING,DONE").split(",").filter(Boolean);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!project_id) return NextResponse.json({ error: "project_id required" }, { status: 400 });

  let q = supabase
    .from("tasks")
    .select("title, status, deadline, created_at")
    .eq("project_id", project_id)
    .in("status", statuses as any)
    .order("created_at", { ascending: true });
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to + "T23:59:59");

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = (data || []).map((t, i) => ({
    ลำดับ: i + 1,
    ชื่องาน: t.title,
    สถานะ: t.status,
    deadline: t.deadline ? fmtDate(t.deadline) : "",
    "วันที่เพิ่ม": fmtDate(t.created_at),
  }));
  const csv = Papa.unparse(rows);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tasks_${today}.csv"`,
    },
  });
}
