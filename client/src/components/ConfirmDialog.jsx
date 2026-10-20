import { useEffect, useRef } from 'react';
import { AlertTriangleIcon } from './icons.jsx';

// Minimal, dependency-free modal confirmation dialog — the first of its kind
// in this client (no Dialog/Modal existed before). Keyboard/focus behavior is
// hand-rolled rather than pulled from a library, consistent with this
// project's existing icon/dependency-minimization choices.
//
// Behavior:
// - Focuses the Cancel button on open (the safer default action).
// - Escape cancels, unless a confirm is already in flight.
// - Tab/Shift+Tab are trapped within the dialog's two buttons.
// - Focus returns to whatever triggered the dialog once it closes.
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirming = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    previouslyFocusedRef.current = document.activeElement;
    cancelRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !confirming) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      // Only two focusable elements in this dialog — trap by swapping
      // between them rather than querying a dynamic focusable-element list.
      event.preventDefault();
      const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current;
      next?.focus();
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, confirming, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !confirming) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? 'confirm-dialog-description' : undefined}
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
      >
        <div className="mb-3 flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-red-500">
            <AlertTriangleIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 id="confirm-dialog-title" className="text-sm font-semibold text-slate-900">
              {title}
            </h2>
            {description && (
              <p id="confirm-dialog-description" className="mt-1 text-sm text-slate-500">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={confirming}
            onClick={onCancel}
            className="h-9 rounded-lg border border-slate-300 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={confirming}
            onClick={onConfirm}
            className="h-9 rounded-lg bg-red-600 px-3.5 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {confirming ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
