"use client";
import { useState, useRef } from "react";

export function ConfirmDeleteButton({
  action,
  hiddenFields,
  label = "ลบ",
  title = "ยืนยันการลบ",
  message = "คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?",
  itemName,
  className = "btn-danger text-xs",
}: {
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields: Record<string, string>;
  label?: string;
  title?: string;
  message?: string;
  itemName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      <form ref={formRef} action={action} className="hidden">
        {Object.entries(hiddenFields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      </form>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="card p-6 max-w-sm w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-bold text-status-late">{title}</h3>
              <p className="text-sm text-black/70 mt-2">
                {message}
                {itemName && (
                  <>
                    <br />
                    <span className="font-semibold text-black">"{itemName}"</span>
                  </>
                )}
              </p>
              <p className="text-xs text-black/50 mt-2">การกระทำนี้ไม่สามารถย้อนกลับได้</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  formRef.current?.requestSubmit();
                  setOpen(false);
                }}
                className="btn-danger"
              >
                ยืนยันลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
