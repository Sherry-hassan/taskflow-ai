// Shared status/state badge. `variant` picks the color only — the visible
// text is always passed in by the caller verbatim (several Playwright specs
// assert the literal task-status/plan-state strings, e.g. "pending_review",
// so this component never relabels or translates its children).
const variantClasses = {
  todo: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  in_progress: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
  done: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  pending_review: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  rejected: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  severity_high: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  severity_medium: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  severity_low: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
  priority_highest: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  priority_high: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  priority_medium: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
  priority_low: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
  ai: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200',
  neutral: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
};

export default function Badge({ variant = 'neutral', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantClasses[variant] ?? variantClasses.neutral} ${className}`}
    >
      {children}
    </span>
  );
}
