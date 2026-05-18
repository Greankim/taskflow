import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { canManageTeams } from "@/lib/permissions";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";

export const dynamic = "force-dynamic";

async function createTeam(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: team, error } = await supabase
    .from("teams").insert({ name, created_by: user.id }).select("id").single();
  if (error || !team) return;
  // auto-add creator as lead
  await supabase.from("team_members").insert({ team_id: team.id, user_id: user.id, role_in_team: "lead" });
  revalidatePath("/teams");
  redirect(`/teams/${team.id}`);
}

async function deleteTeam(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const supabase = createServerSupabase();
  await supabase.from("teams").delete().eq("id", id);
  revalidatePath("/teams");
}

export default async function TeamsPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role || "worker";

  const { data: teams } = await supabase.from("teams").select("id, name, created_at").order("created_at", { ascending: false });

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Teams</h1>

      {canManageTeams(role) && (
        <form action={createTeam} className="card p-4 flex gap-3">
          <input name="name" required placeholder="ชื่อทีมใหม่" className="input flex-1" />
          <button className="btn-primary">สร้างทีม</button>
        </form>
      )}

      <div className="space-y-2">
        {(teams || []).map((t) => (
          <div key={t.id} className="card p-4 flex items-center justify-between">
            <Link href={`/teams/${t.id}`} className="font-medium hover:text-brand-700">{t.name}</Link>
            {canManageTeams(role) && (
              <ConfirmDeleteButton
                action={deleteTeam}
                hiddenFields={{ id: t.id }}
                title="ลบทีม"
                message="การลบทีมนี้จะลบ projects และ tasks ทั้งหมดด้วย"
                itemName={t.name}
              />
            )}
          </div>
        ))}
        {(teams || []).length === 0 && <p className="text-sm text-black/60">ยังไม่มีทีม</p>}
      </div>
    </div>
  );
}
