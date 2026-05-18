import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { isLeadOrAbove } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const ACTION_TH: Record<string, string> = {
  task_created: "สร้างงาน",
  task_updated: "แก้ไขชื่องาน",
  task_deleted: "ลบงาน",
  status_changed: "เปลี่ยนสถานะ",
  deadline_changed: "แก้ไข deadline",
  assignee_added: "เพิ่มผู้รับผิดชอบ",
  assignee_removed: "นำผู้รับผิดชอบออก",
  role_changed: "เปลี่ยน role",
};

export default async function ActivityPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isLeadOrAbove((me?.role || "worker") as any)) return <div>ไม่มีสิทธิ์เข้าถึง</div>;

  const { data: logs } = await supabase
    .from("activity_logs")
    .select("id, created_at, action, payload, actor_id, profiles:actor_id(username)")
    .eq("project_id", params.id)
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <div className="flex gap-2">
          <a href={`/api/export/activity?project_id=${params.id}`} className="btn-primary">Export CSV</a>
          <Link href={`/projects/${params.id}`} className="btn-secondary">← Board</Link>
        </div>
      </div>
      <div className="card divide-y divide-black/5">
        {(logs || []).map((l: any) => (
          <div key={l.id} className="p-3 text-sm flex justify-between gap-4">
            <div>
              <div>
                <span className="font-medium">@{l.profiles?.username || "system"}</span>
                <span className="ml-2 badge bg-brand-100 text-brand-800">{ACTION_TH[l.action] || l.action}</span>
              </div>
              <div className="text-xs text-black/60 mt-1">{JSON.stringify(l.payload)}</div>
            </div>
            <div className="text-xs text-black/40 whitespace-nowrap">
              {new Date(l.created_at).toLocaleString("th-TH")}
            </div>
          </div>
        ))}
        {!(logs || []).length && <div className="p-6 text-sm text-black/50">ยังไม่มี activity</div>}
      </div>
    </div>
  );
}
