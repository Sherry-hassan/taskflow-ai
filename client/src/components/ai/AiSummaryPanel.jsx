import { FileTextIcon } from '../icons.jsx';

// Generates a concise summary of project progress, accomplishments,
// blockers, and next steps. Read-only, same as risk assessment — no
// approve/reject step.
export default function AiSummaryPanel({ onRequest, requesting, summaries }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <FileTextIcon className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-900">AI progress summary</h3>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Generate a concise summary of progress, accomplishments, blockers, and next steps.
      </p>

      <button
        type="button"
        onClick={onRequest}
        disabled={requesting}
        className="mb-4 inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {requesting ? 'Requesting…' : 'Request summary'}
      </button>

      <ul className="space-y-3">
        {summaries?.map((summary) => (
          <li key={summary.id} className="rounded-lg border border-slate-200 p-4 text-sm">
            {summary.validatedOutput?.summary && <p className="mb-2 text-slate-700">{summary.validatedOutput.summary}</p>}
            {summary.validatedOutput?.highlights && (
              <ul className="list-inside list-disc text-slate-700">
                {summary.validatedOutput.highlights.map((highlight, index) => (
                  <li key={index}>{highlight}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
