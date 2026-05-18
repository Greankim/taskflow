"use client";
import { useState } from "react";

export function ExportDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [statuses, setStatuses] = useState<string[]>(["TODO", "DOING", "DONE"]);
  const [range, setRange] = useState<"today" | "week" | "custom">("week");
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);

  function toggle(s: string) {
    setStatuses((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]);
  }
  function download() {
    let f = from, t = to;
    if (range === "today") f = t = today;
    else if (range === "week") { f = weekAgo; t = today; }
    const params = new URLSearchParams({
      project_id: projectId,
      status: statuses.join(","),
      from: f, to: t,
    });
    window.location.href = `/api/export/tasks?${params}`;
    onClose();
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card p-6 max-w-md w-full space-y-4">
        <h2 className="text-lg font-bold">Export Tasks เป็น CSV</h2>
        <div>
          <div className="text-sm font-medium mb-2">เลือกสถานะ</div>
          <div className="flex gap-3">
            {["TODO", "DOING", "DONE"].map((s) => (
              <label key={s} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggle(s)} />
                {s}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm font-medium mb-2">ช่วงวันที่</div>
          <div className="flex gap-2 text-sm mb-2">
            {[["today", "วันนี้"], ["week", "สัปดาห์นี้"], ["custom", "กำหนดเอง"]].map(([v, l]) => (
              <button key={v} onClick={() => setRange(v as any)}
                className={`px-3 py-1 rounded border ${range === v ? "bg-brand-700 text-white border-brand-700" : "border-black/10"}`}>{l}</button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex gap-2">
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary">ยกเลิก</button>
          <button onClick={download} className="btn-primary">Download</button>
        </div>
      </div>
    </div>
  );
}
