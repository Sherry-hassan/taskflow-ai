import Badge from '../Badge.jsx';
import { SparkleIcon } from '../icons.jsx';

// Turns a project goal into a proposed task breakdown. Proposed tasks are
// never created automatically — approval (gated on canManageProject, the
// same owner/admin check used everywhere else in this page) is the only
// path from a plan suggestion to real Task documents, exactly as the
// existing /ai/plans/:id/approve endpoint already requires.
export default function AiPlanPanel({
  goalDescription,
  onGoalDescriptionChange,
  onSubmit,
  requesting,
  error,
  plans,
  canManageProject,
  onApprove,
  onReject,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <SparkleIcon className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-900">AI task-plan suggestions</h3>
      </div>
      <p className="mb-4 text-sm text-slate-500">Turn a project goal into a proposed, actionable task breakdown.</p>

      <form onSubmit={onSubmit} className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="goal-description" className="sr-only">
          Goal description
        </label>
        <input
          id="goal-description"
          value={goalDescription}
          onChange={(event) => onGoalDescriptionChange(event.target.value)}
          placeholder="Describe a goal to get a proposed task breakdown"
          required
          className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <button
          type="submit"
          disabled={requesting}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {requesting ? 'Requesting…' : 'Request plan'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      {plans === null && <p className="text-sm text-slate-500">Loading…</p>}
      {plans !== null && plans.length === 0 && <p className="text-sm text-slate-500">No plan suggestions yet.</p>}

      <ul className="space-y-3">
        {plans?.map((plan) => (
          <li key={plan.id} className="rounded-lg border border-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between">
              <Badge variant={plan.state}>{plan.state}</Badge>
              {canManageProject && plan.state === 'pending_review' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onApprove(plan.id)}
                    className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(plan.id)}
                    className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
            {plan.validatedOutput?.tasks && (
              <ul className="list-inside list-disc text-sm text-slate-700">
                {plan.validatedOutput.tasks.map((task, index) => (
                  <li key={index}>{task.title}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
