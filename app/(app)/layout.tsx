import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAdminOrAbove } from "@/lib/permissions";
import { QueryProvider } from "@/components/QueryProvider";

async function logoutAction() {
  "use server";
  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  const role = profile.role as string;
  const roleLabel: Record<string, string> = {
    root_admin: "Root Admin", admin: "Admin", team_lead: "Team Lead", worker: "Worker",
  };

  return (
    <QueryProvider>
      <div className="min-h-screen flex bg-gray-50">
        <aside className="w-60 bg-black text-white flex flex-col">
          <div className="px-5 py-5 border-b border-white/10">
            <div className="text-xl font-bold">TaskFlow</div>
            <div className="text-xs text-white/60 mt-1">
              @{profile.username}
              <div className="text-brand-400">{roleLabel[role]}</div>
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
            <Link className="block px-3 py-2 rounded hover:bg-white/10" href="/dashboard">Dashboard</Link>
            <Link className="block px-3 py-2 rounded hover:bg-white/10" href="/teams">Teams</Link>
            <Link className="block px-3 py-2 rounded hover:bg-white/10" href="/teams/join">Join Team</Link>
            {isAdminOrAbove(role as any) && (
              <>
                <div className="pt-3 pb-1 px-3 text-xs uppercase tracking-wide text-white/40">Admin</div>
                <Link className="block px-3 py-2 rounded hover:bg-white/10" href="/admin/users">จัดการผู้ใช้</Link>
                <Link className="block px-3 py-2 rounded hover:bg-white/10" href="/admin/overview">Overview</Link>
              </>
            )}
          </nav>
          <form action={logoutAction} className="p-3 border-t border-white/10">
            <button className="w-full text-left px-3 py-2 rounded hover:bg-white/10 text-sm">ออกจากระบบ</button>
          </form>
        </aside>
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </QueryProvider>
  );
}
