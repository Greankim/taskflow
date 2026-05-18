import Link from "next/link";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { isAdminOrAbove } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdminOrAbove((me?.role || "worker") as any)) return <div>ไม่มีสิทธิ์เข้าถึง</div>;

  const admin = createAdminSupabase();
  const { data: teams } = await admin.from("teams").select("id, name, created_at").order("created_at", { ascending: false });
  const { data: projects } = await admin.from("projects").select("id, team_id, name");
  const { data: tasks } = await admin.from("tasks").select("project_id, status, deadline");

  const projectByTeam: Record<string, any[]> = {};
  (projects || []).forEach((p) => {
    (projectByTeam[p.team_id] = projectByTeam[p.team_id] || []).push(p);
  });
  const taskStats = (project_id: string) => {
    const list = (tasks || []).filter((t) => t.project_id === project_id);
    return {
      total: list.length,
      todo: list.filter((t) => t.status === "TODO").length,
      doing: list.filter((t) => t.status === "DOING").length,
      done: list.filter((t) => t.status === "DONE").length,
    };
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Overview ทุก Team & Project</h1>
      {(teams || []).map((t) => (
        <div key={t.id} className="card p-4">
          <div className="flex justify-between items-center mb-3">
            <Link href={`/teams/${t.id}`} className="text-lg font-semibold hover:text-brand-700">{t.name}</Link>
            <span className="text-xs text-black/50">{new Date(t.created_at).toLocaleDateString("th-TH")}</span>
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            {(projectByTeam[t.id] || []).map((p) => {
              const s = taskStats(p.id);
              const pct = s.total === 0 ? 0 : Math.round((s.done / s.total) * 100);
              return (
                <Link key={p.id} href={`/projects/${p.id}`}
                  className="block p-3 rounded border border-black/10 hover:bg-black/5">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-black/60 mt-1">
                    Total {s.total} · TODO {s.todo} · DOING {s.doing} · DONE {s.done}
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-black/50 mb-1">
                      <span>ความคืบหน้า</span><span>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
                      <div className={`h-full ${pct === 100 ? "bg-status-done" : "bg-brand-700"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </Link>
              );
            })}
            {!(projectByTeam[t.id] || []).length && <div className="text-sm text-black/40">ยังไม่มี project</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
