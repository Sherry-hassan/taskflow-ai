import Badge from '../Badge.jsx';
import { AlertTriangleIcon } from '../icons.jsx';

const severityVariant = { high: 'severity_high', medium: 'severity_medium', low: 'severity_low' };

// Identifies project risks and surfaces mitigation insights. Read-only by
// design — unlike plan suggestions, a risk assessment never creates or
// changes anything, so there is no approve/reject step here.
export default function AiRiskPanel({ onRequest, requesting, risks }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <AlertTriangleIcon className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-900">AI risk assessment</h3>
      </div>
      <p className="mb-4 text-sm text-slate-500">Identify project risks and surface useful mitigation insights.</p>

      <button
        type="button"
        onClick={onRequest}
        disabled={requesting}
        className="mb-4 inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {requesting ? 'Requesting…' : 'Request risk assessment'}
      </button>

      <ul className="space-y-3">
        {risks?.map((risk) => (
          <li key={risk.id} className="rounded-lg border border-slate-200 p-4 text-sm">
            {risk.validatedOutput?.summary && <p className="mb-2 text-slate-700">{risk.validatedOutput.summary}</p>}
            {risk.validatedOutput?.risks && (
              <ul className="space-y-1.5">
                {risk.validatedOutput.risks.map((r, index) => (
                  <li key={index} className="flex items-center justify-between gap-2">
                    <span className="text-slate-700">{r.description}</span>
                    <Badge variant={severityVariant[r.severity] ?? 'neutral'}>{r.severity}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
