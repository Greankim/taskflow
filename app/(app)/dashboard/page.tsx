import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { isLate } from "@/lib/utils";
import { RealtimeRefresher } from "@/components/RealtimeRefresher";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Get tasks user can see (RLS handles filtering by team membership)
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, status, deadline, project_id");

  // Tasks where user is assignee (their own tasks)
  const { data: myAssignments } = await supabase
    .from("task_assignees")
    .select("task_id, tasks(id, status, deadline, project_id)")
    .eq("user_id", user.id);

  const myTasks = (myAssignments || [])
    .map((a: any) => a.tasks)
    .filter(Boolean);

  const counts = countByStatus(myTasks);
  const allCounts = countByStatus(tasks || []);

  return (
    <div className="space-y-8">
      <RealtimeRefresher channel="dashboard" />
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-black/60">ภาพรวมงานของคุณ</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">งานของฉัน</h2>
        <StatsRow {...counts} />
        <ProgressBar done={counts.DONE} total={counts.Total} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">ภาพรวมทุก project ที่เข้าถึงได้</h2>
        <StatsRow {...allCounts} />
        <ProgressBar done={allCounts.DONE} total={allCounts.Total} />
      </section>

      <div className="flex gap-3">
        <Link href="/teams" className="btn-primary">ไปที่ Teams</Link>
        <Link href="/teams/join" className="btn-secondary">เข้าร่วมทีมด้วย code</Link>
      </div>
    </div>
  );
}

function countByStatus(tasks: { status: string; deadline: string | null }[]) {
  let TODO = 0, DOING = 0, DONE = 0, Late = 0;
  for (const t of tasks) {
    if (t.status === "TODO") TODO++;
    else if (t.status === "DOING") DOING++;
    else if (t.status === "DONE") DONE++;
    if (isLate(t.deadline, t.status)) Late++;
  }
  return { TODO, DOING, DONE, Late, Total: tasks.length };
}

function StatsRow(c: { TODO: number; DOING: number; DONE: number; Late: number; Total: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
      <StatCard label="TODO" value={c.TODO} color="bg-blue-100 text-blue-800" />
      <StatCard label="DOING" value={c.DOING} color="bg-yellow-100 text-yellow-800" />
      <StatCard label="DONE" value={c.DONE} color="bg-green-100 text-green-800" />
      <StatCard label="Late" value={c.Late} color="bg-red-100 text-red-800" />
      <StatCard label="Total" value={c.Total} color="bg-black text-white" />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-black/60">{label}</div>
      <div className={`mt-1 inline-block px-2 py-0.5 rounded ${color} font-bold text-lg`}>{value}</div>
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="font-medium">ความคืบหน้า</span>
        <span className="text-black/60">{pct}% ({done}/{total})</span>
      </div>
      <div className="h-3 bg-black/5 rounded-full overflow-hidden">
        <div className="h-full bg-brand-700 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
