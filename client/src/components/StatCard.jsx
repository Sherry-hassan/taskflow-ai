export default function StatCard({ label, value, accent = 'slate' }) {
  const accentClasses = {
    slate: 'text-slate-900',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
    emerald: 'text-emerald-600',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold ${accentClasses[accent] ?? accentClasses.slate}`}>{value}</p>
    </div>
  );
}
