import { revalidatePath } from "next/cache";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { isAdminOrAbove, isRootAdmin, canSetUserRole } from "@/lib/permissions";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

async function setRoleAction(formData: FormData) {
  "use server";
  const user_id = String(formData.get("user_id"));
  const new_role = String(formData.get("role")) as Role;
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: actor } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const { data: target } = await supabase.from("profiles").select("role").eq("id", user_id).single();
  if (!actor || !target) return;
  if (!canSetUserRole(actor.role as Role, target.role as Role, new_role)) return;
  const admin = createAdminSupabase();
  await admin.from("profiles").update({ role: new_role }).eq("id", user_id);
  await admin.from("activity_logs").insert({
    actor_id: user.id, action: "role_changed",
    payload: { target_user: user_id, from: target.role, to: new_role },
  });
  revalidatePath("/admin/users");
}

export default async function AdminUsersPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const myRole = (me?.role || "worker") as Role;
  if (!isAdminOrAbove(myRole)) return <div>ไม่มีสิทธิ์เข้าถึง</div>;

  const admin = createAdminSupabase();
  const { data: users } = await admin
    .from("profiles").select("id, username, role, created_at")
    .order("created_at", { ascending: false });

  const roles: Role[] = ["worker", "team_lead", "admin"];
  if (isRootAdmin(myRole)) roles.push("root_admin");

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-bold">จัดการผู้ใช้</h1>
      <div className="card divide-y divide-black/5">
        {(users || []).map((u) => {
          const targetRole = u.role as Role;
          const isRoot = targetRole === "root_admin";
          return (
            <div key={u.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">@{u.username}</div>
                <div className="text-xs text-black/60">ปัจจุบัน: <span className="badge bg-brand-100 text-brand-800">{targetRole}</span></div>
              </div>
              {isRoot ? (
                <span className="text-xs text-black/40">root admin (ล็อก)</span>
              ) : (
                <form action={setRoleAction} className="flex gap-2">
                  <input type="hidden" name="user_id" value={u.id} />
                  <select name="role" defaultValue={u.role} className="input !w-32 text-sm">
                    {roles.filter((r) => r !== "root_admin" || isRootAdmin(myRole)).map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <button className="btn-primary text-xs">บันทึก</button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
