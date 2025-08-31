// AccessDeniedModal.jsx
import React from "react";

export default function AccessDeniedModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      role="presentation"
      onClick={(e) => {
        // close when backdrop clicked
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-denied-title"
        className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl"
      >
        <h2 id="access-denied-title" className="text-xl font-semibold mb-2">
          Access denied
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          You don’t have permission to view this page.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded-lg border"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
