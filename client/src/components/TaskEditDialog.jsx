import { useEffect, useRef } from 'react';

// Minimal modal shell for editing a task — reuses ConfirmDialog's overlay
// conventions (fixed inset backdrop, role="dialog", Escape to close,
// click-outside to close) but hosts arbitrary form content instead of a
// fixed two-button layout.
export default function TaskEditDialog({ open, title, onClose, children }) {
  const previouslyFocusedRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    previouslyFocusedRef.current = document.activeElement;
    dialogRef.current?.querySelector('input, textarea, select')?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-edit-dialog-title"
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 id="task-edit-dialog-title" className="mb-3 text-sm font-semibold text-slate-900">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
