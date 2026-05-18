"use client";
import { useState, useRef, useEffect, useTransition } from "react";

export function InlineRename({
  initialValue,
  action,
  hiddenFields,
  className = "text-2xl font-bold",
  label = "ชื่อ",
}: {
  initialValue: string;
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields: Record<string, string>;
  className?: string;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    const fd = new FormData();
    Object.entries(hiddenFields).forEach(([k, v]) => fd.append(k, v));
    fd.append("name", trimmed);
    startTransition(async () => {
      await action(fd);
      setEditing(false);
      setConfirming(false);
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <h1 className={className}>{initialValue}</h1>
        <button
          type="button"
          onClick={() => { setValue(initialValue); setEditing(true); }}
          className="btn-secondary text-xs !py-1 !px-2"
          title="แก้ไขชื่อ"
        >
          ✏️ แก้ไข
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setEditing(false); setValue(initialValue); }
            if (e.key === "Enter") { e.preventDefault(); if (value.trim() && value !== initialValue) setConfirming(true); }
          }}
          disabled={pending}
          className="input !w-auto text-2xl font-bold"
        />
        <button
          type="button"
          onClick={() => { if (value.trim() && value !== initialValue) setConfirming(true); else setEditing(false); }}
          disabled={pending}
          className="btn-primary text-xs"
        >
          บันทึก
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setValue(initialValue); }}
          disabled={pending}
          className="btn-secondary text-xs"
        >
          ยกเลิก
        </button>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !pending && setConfirming(false)}
        >
          <div className="card p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">ยืนยันการแก้ไข</h3>
            <p className="text-sm text-black/70">
              เปลี่ยน{label}จาก<br />
              <span className="font-semibold text-black/60 line-through">"{initialValue}"</span><br />
              เป็น<br />
              <span className="font-semibold text-black">"{value.trim()}"</span> ?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="btn-secondary">
                ยกเลิก
              </button>
              <button type="button" onClick={submit} disabled={pending} className="btn-primary">
                {pending ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
