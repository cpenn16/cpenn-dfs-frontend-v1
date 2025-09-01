// src/components/AccessDeniedModal.jsx
import React, { useEffect, useRef } from "react";

export default function AccessDeniedModal({ open, onClose, title, description, actions = [] }) {
  const backdropRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose?.(); // close on backdrop
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-denied-title"
    >
      <div className="w-[92%] max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <h2 id="access-denied-title" className="text-xl font-semibold">
          {title || "Access denied"}
        </h2>
        {description ? <p className="mt-2 text-sm text-gray-600">{description}</p> : null}

        {actions.length > 0 && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3">
            <div className="text-sm font-medium text-gray-800">How to get access</div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {actions.map((a, i) => (
                <a
                  key={i}
                  href={a.href}
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {a.label}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
