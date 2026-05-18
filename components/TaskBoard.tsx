"use client";
import { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { isLate, fmtDate } from "@/lib/utils";
import { ExportDialog } from "./ExportDialog";

type Member = { id: string; username: string };
type Task = {
  id: string; title: string; status: "TODO" | "DOING" | "DONE";
  deadline: string | null; created_at: string;
  assignees: Member[];
};

const STATUSES = ["TODO", "DOING", "DONE"] as const;

export function TaskBoard({
  projectId, canManage, currentUserId, members,
}: { projectId: string; canManage: boolean; currentUserId: string; members: Member[] }) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"ALL" | "TODO" | "DOING" | "DONE" | "LATE">("ALL");
  const [showExport, setShowExport] = useState(false);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["tasks", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, deadline, created_at, task_assignees(user_id, profiles(id, username))")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((t: any) => ({
        ...t,
        assignees: (t.task_assignees || []).map((a: any) => a.profiles),
      }));
    },
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`project-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["tasks", projectId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" },
        () => qc.invalidateQueries({ queryKey: ["tasks", projectId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, projectId, qc]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return tasks;
    if (filter === "LATE") return tasks.filter((t) => isLate(t.deadline, t.status));
    return tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const data = e.active.data.current as any;
    const overId = String(e.over.id);
    if (data?.type === "task" && overId.startsWith("col-")) {
      const newStatus = overId.replace("col-", "") as Task["status"];
      const task = tasks.find((t) => t.id === data.taskId);
      if (!task || task.status === newStatus) return;
      await supabase.from("tasks").update({ status: newStatus }).eq("id", task.id);
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-sm">
          {["ALL", "TODO", "DOING", "DONE", "LATE"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s as any)}
              className={`px-3 py-1.5 rounded border ${filter === s ? "bg-brand-700 text-white border-brand-700" : "bg-white border-black/10 hover:bg-black/5"}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {canManage && <NewTaskForm projectId={projectId} />}
          <button onClick={() => setShowExport(true)} className="btn-secondary">Export CSV</button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid md:grid-cols-3 gap-4">
          {STATUSES.map((s) => (
            <Column key={s} status={s} tasks={filtered.filter((t) => t.status === s)} canManage={canManage}
              currentUserId={currentUserId} supabase={supabase} projectId={projectId} qc={qc} members={members} />
          ))}
        </div>
      </DndContext>

      {showExport && <ExportDialog projectId={projectId} onClose={() => setShowExport(false)} />}
    </div>
  );
}

function NewTaskForm({ projectId }: { projectId: string }) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"TODO" | "DOING" | "DONE">("TODO");
  const [deadline, setDeadline] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("tasks").insert({
      project_id: projectId, title: title.trim(), status, deadline: deadline || null, created_by: user.id,
    });
    setTitle(""); setDeadline(""); setStatus("TODO"); setOpen(false);
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
  }
  if (!open) return <button onClick={() => setOpen(true)} className="btn-primary">+ เพิ่มงาน</button>;
  return (
    <form onSubmit={submit} className="card p-3 flex flex-wrap gap-2 items-end">
      <input className="input" placeholder="ชื่องาน" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <select className="input w-28" value={status} onChange={(e) => setStatus(e.target.value as any)}>
        <option>TODO</option><option>DOING</option><option>DONE</option>
      </select>
      <input type="date" className="input w-40" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      <button className="btn-primary">บันทึก</button>
      <button type="button" onClick={() => setOpen(false)} className="btn-secondary">ยกเลิก</button>
    </form>
  );
}

function Column({ status, tasks, canManage, currentUserId, supabase, projectId, qc, members }: any) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}` });
  const colorMap: any = { TODO: "border-status-todo", DOING: "border-status-doing", DONE: "border-status-done" };
  return (
    <div ref={setNodeRef} className={`card p-3 border-t-4 ${colorMap[status]} ${isOver ? "ring-2 ring-brand-500" : ""}`}>
      <div className="font-semibold mb-3 flex justify-between">
        <span>{status}</span><span className="text-black/40 text-sm">{tasks.length}</span>
      </div>
      <div className="space-y-2 min-h-[120px]">
        {tasks.map((t: Task) => (
          <TaskCard key={t.id} task={t} canManage={canManage} currentUserId={currentUserId}
            supabase={supabase} projectId={projectId} qc={qc} members={members} />
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task, canManage, currentUserId, supabase, projectId, qc, members }: any) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-task-${task.id}`,
    data: { type: "task", taskId: task.id },
  });

  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [deadline, setDeadline] = useState(task.deadline || "");

  const late = isLate(task.deadline, task.status);
  const badge = task.status === "TODO" ? "badge-todo" : task.status === "DOING" ? "badge-doing" : "badge-done";

  const canEditThis = canManage || task.assignees.some((a: Member) => a.id === currentUserId);

  async function save() {
    await supabase.from("tasks").update({ title: title.trim(), deadline: deadline || null }).eq("id", task.id);
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
  }
  async function doDelete() {
    await supabase.from("tasks").delete().eq("id", task.id);
    setConfirming(false);
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
  }
  async function setStatus(s: string) {
    await supabase.from("tasks").update({ status: s }).eq("id", task.id);
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
  }
  async function removeAssignee(uid: string) {
    await supabase.from("task_assignees").delete().eq("task_id", task.id).eq("user_id", uid);
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
  }
  async function addAssignee(uid: string) {
    await supabase.from("task_assignees").upsert({ task_id: task.id, user_id: uid });
    setPickerOpen(false);
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
  }

  const assigneeIds = new Set(task.assignees.map((a: Member) => a.id));
  const available = (members as Member[] | undefined)?.filter((m) => !assigneeIds.has(m.id)) || [];

  return (
    <div ref={setNodeRef}
      className={`p-3 rounded border bg-white ${late ? "border-status-late ring-1 ring-red-200" : "border-black/10"}
        ${isDragging ? "opacity-50" : ""}`}>
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1">
          {editing ? (
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input text-sm mb-1" />
          ) : (
            <div className="font-medium text-sm" {...listeners} {...attributes}>{task.title}</div>
          )}
          <div className="flex flex-wrap gap-1 mt-1 items-center text-xs">
            <span className={late ? "badge-late" : badge}>{late ? "LATE" : task.status}</span>
            {editing ? (
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="input py-0.5 text-xs w-32" />
            ) : (
              task.deadline && <span className="text-black/60">⏰ {fmtDate(task.deadline)}</span>
            )}
            <span className="text-black/40">+ {fmtDate(task.created_at)}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-2 items-center">
            {task.assignees.map((a: Member) => (
              <span key={a.id} className="badge bg-black/5 text-black">
                @{a.username}
                {canManage && (
                  <button onClick={() => removeAssignee(a.id)} className="ml-1 text-red-600" title="เอาออก">×</button>
                )}
              </span>
            ))}
            {canManage && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="badge bg-brand-100 text-brand-800 hover:bg-brand-200 cursor-pointer"
                >
                  + Add worker
                </button>
                {pickerOpen && (
                  <div className="absolute left-0 top-full mt-1 z-20 card p-2 w-48 max-h-56 overflow-auto shadow-lg">
                    {available.length === 0 ? (
                      <div className="text-xs text-black/50 p-2">ไม่มีสมาชิกให้เพิ่มแล้ว</div>
                    ) : (
                      available.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => addAssignee(m.id)}
                          className="block w-full text-left px-2 py-1.5 text-sm hover:bg-brand-50 rounded"
                        >
                          @{m.username}
                        </button>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => setPickerOpen(false)}
                      className="block w-full text-center text-xs text-black/50 hover:bg-black/5 rounded mt-1 py-1"
                    >
                      ปิด
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {canEditThis && (
        <div className="flex gap-1 mt-2 text-xs">
          {editing ? (
            <>
              <button onClick={save} className="btn-primary !py-1 !px-2 text-xs">บันทึก</button>
              <button onClick={() => setEditing(false)} className="btn-secondary !py-1 !px-2 text-xs">ยกเลิก</button>
            </>
          ) : (
            <>
              <select value={task.status} onChange={(e) => setStatus(e.target.value)}
                className="input !py-0.5 text-xs w-24">
                <option>TODO</option><option>DOING</option><option>DONE</option>
              </select>
              {canManage && (
                <>
                  <button onClick={() => setEditing(true)} className="btn-secondary !py-1 !px-2 text-xs">แก้ไข</button>
                  <button onClick={() => setConfirming(true)} className="btn-danger !py-1 !px-2 text-xs">ลบ</button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
             onClick={() => setConfirming(false)}>
          <div className="card p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-status-late">ลบงาน</h3>
            <p className="text-sm text-black/70">
              ต้องการลบงานนี้?<br />
              <span className="font-semibold text-black">"{task.title}"</span>
            </p>
            <p className="text-xs text-black/50">การกระทำนี้ไม่สามารถย้อนกลับได้</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} className="btn-secondary">ยกเลิก</button>
              <button onClick={doDelete} className="btn-danger">ยืนยันลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
