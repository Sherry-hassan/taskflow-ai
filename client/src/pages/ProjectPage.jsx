import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import { useProjectSocket } from '../realtime/useProjectSocket.js';
import TaskCard from '../components/TaskCard.jsx';

export default function ProjectPage() {
  const { workspaceId, projectId } = useParams();
  const { accessToken, userId, callWithAuth } = useAuth();

  const [role, setRole] = useState(null);
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [members, setMembers] = useState(null);
  const [error, setError] = useState('');

  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  const [goalDescription, setGoalDescription] = useState('');
  const [requestingPlan, setRequestingPlan] = useState(false);
  const [plans, setPlans] = useState(null);
  const [planError, setPlanError] = useState('');

  const [risks, setRisks] = useState(null);
  const [requestingRisk, setRequestingRisk] = useState(false);
  const [summaries, setSummaries] = useState(null);
  const [requestingSummary, setRequestingSummary] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [workspaces, projectData, taskList, memberList, planList] = await Promise.all([
        callWithAuth(api.listWorkspaces),
        callWithAuth(api.getProject, workspaceId, projectId),
        callWithAuth(api.listTasks, workspaceId, projectId),
        callWithAuth(api.listMembers, workspaceId),
        callWithAuth(api.listPlans, workspaceId, projectId),
      ]);
      const entry = workspaces.find((w) => w.workspace.id === workspaceId);
      setRole(entry?.role ?? null);
      setProject(projectData);
      setTasks(taskList);
      setMembers(memberList);
      setPlans(planList);
    } catch (err) {
      setError(err.message || 'Failed to load project');
    }
  }, [callWithAuth, workspaceId, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // UX-layer hint only (same pattern as TaskCard's own client-side check and
  // WorkspacePage's canManage) — the server independently re-derives and
  // re-enforces every one of these on every request.
  const canManageProject = role === 'owner' || role === 'admin';

  useProjectSocket({
    accessToken,
    projectId,
    onTaskCreated: (task) => setTasks((prev) => (prev ? [...prev, task] : [task])),
    onTaskUpdated: (task) =>
      setTasks((prev) => (prev ? prev.map((t) => (t.id === task.id ? task : t)) : prev)),
    onTaskDeleted: ({ id }) => setTasks((prev) => (prev ? prev.filter((t) => t.id !== id) : prev)),
  });

  async function handleCreateTask(event) {
    event.preventDefault();
    setError('');
    setCreatingTask(true);
    try {
      await callWithAuth(api.createTask, workspaceId, projectId, {
        title: taskTitle,
        assigneeId: taskAssigneeId || null,
      });
      setTaskTitle('');
      setTaskAssigneeId('');
      // No optimistic-only update: the realtime task:created event (or, if
      // the socket hasn't joined yet, this reload) is what actually reflects
      // the confirmed write — never assume success before the server says so.
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  }

  async function handleStatusChange(taskId, status) {
    try {
      await callWithAuth(api.updateTask, workspaceId, projectId, taskId, { status });
    } catch (err) {
      setError(err.message || 'Failed to update task');
    }
  }

  async function handleRequestPlan(event) {
    event.preventDefault();
    setPlanError('');
    setRequestingPlan(true);
    try {
      await callWithAuth(api.requestPlan, workspaceId, projectId, goalDescription);
      setGoalDescription('');
      const planList = await callWithAuth(api.listPlans, workspaceId, projectId);
      setPlans(planList);
    } catch (err) {
      setPlanError(err.message || 'Failed to request a plan suggestion');
    } finally {
      setRequestingPlan(false);
    }
  }

  async function handleApprovePlan(artifactId) {
    setPlanError('');
    try {
      await callWithAuth(api.approvePlan, workspaceId, projectId, artifactId);
      const [planList, taskList] = await Promise.all([
        callWithAuth(api.listPlans, workspaceId, projectId),
        callWithAuth(api.listTasks, workspaceId, projectId),
      ]);
      setPlans(planList);
      setTasks(taskList);
    } catch (err) {
      setPlanError(err.message || 'Failed to approve plan suggestion');
    }
  }

  async function handleRejectPlan(artifactId) {
    setPlanError('');
    try {
      await callWithAuth(api.rejectPlan, workspaceId, projectId, artifactId);
      const planList = await callWithAuth(api.listPlans, workspaceId, projectId);
      setPlans(planList);
    } catch (err) {
      setPlanError(err.message || 'Failed to reject plan suggestion');
    }
  }

  async function handleRequestRisk() {
    setRequestingRisk(true);
    try {
      await callWithAuth(api.requestRiskAssessment, workspaceId, projectId);
      const riskList = await callWithAuth(api.listRiskAssessments, workspaceId, projectId);
      setRisks(riskList);
    } catch (err) {
      setError(err.message || 'Failed to request a risk assessment');
    } finally {
      setRequestingRisk(false);
    }
  }

  async function handleRequestSummary() {
    setRequestingSummary(true);
    try {
      await callWithAuth(api.requestSummary, workspaceId, projectId);
      const summaryList = await callWithAuth(api.listSummaries, workspaceId, projectId);
      setSummaries(summaryList);
    } catch (err) {
      setError(err.message || 'Failed to request a summary');
    } finally {
      setRequestingSummary(false);
    }
  }

  return (
    <div>
      <p className="mb-1 text-sm text-gray-500">
        <Link to="/" className="hover:underline">
          Workspaces
        </Link>{' '}
        /{' '}
        <Link to={`/workspaces/${workspaceId}`} className="hover:underline">
          Workspace
        </Link>{' '}
        /
      </p>
      <h2 className="mb-6 text-lg font-semibold text-gray-900">{project?.name ?? 'Project'}</h2>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <section className="mb-10">
        <h3 className="mb-2 font-medium text-gray-800">Tasks</h3>
        <form onSubmit={handleCreateTask} className="mb-4 flex flex-wrap gap-2">
          <label htmlFor="task-title" className="sr-only">
            Task title
          </label>
          <input
            id="task-title"
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
            placeholder="New task title"
            required
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <label htmlFor="task-assignee" className="sr-only">
            Assignee
          </label>
          <select
            id="task-assignee"
            value={taskAssigneeId}
            onChange={(event) => setTaskAssigneeId(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Unassigned</option>
            {members?.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.email}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={creatingTask}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add task
          </button>
        </form>

        {tasks === null && <p className="text-gray-500">Loading…</p>}
        {tasks !== null && tasks.length === 0 && <p className="text-gray-500">No tasks yet.</p>}
        <div className="space-y-3">
          {tasks?.map((task) => (
            <div key={task.id} className="rounded border border-gray-200 bg-white p-4">
              <TaskCard
                task={task}
                currentUserId={userId}
                currentRole={role}
                onStatusChange={handleStatusChange}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h3 className="mb-2 font-medium text-gray-800">AI task-plan suggestions</h3>
        <form onSubmit={handleRequestPlan} className="mb-4 flex gap-2">
          <label htmlFor="goal-description" className="sr-only">
            Goal description
          </label>
          <input
            id="goal-description"
            value={goalDescription}
            onChange={(event) => setGoalDescription(event.target.value)}
            placeholder="Describe a goal to get a proposed task breakdown"
            required
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={requestingPlan}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Request plan
          </button>
        </form>
        {planError && (
          <p role="alert" className="mb-2 text-sm text-red-600">
            {planError}
          </p>
        )}
        {plans === null && <p className="text-gray-500">Loading…</p>}
        {plans !== null && plans.length === 0 && <p className="text-gray-500">No plan suggestions yet.</p>}
        <ul className="space-y-3">
          {plans?.map((plan) => (
            <li key={plan.id} className="rounded border border-gray-200 bg-white p-4">
              <p className="mb-1 text-sm">
                <span className="font-medium text-gray-900">{plan.state}</span>
              </p>
              {plan.validatedOutput?.tasks && (
                <ul className="mb-2 list-inside list-disc text-sm text-gray-700">
                  {plan.validatedOutput.tasks.map((task, index) => (
                    <li key={index}>{task.title}</li>
                  ))}
                </ul>
              )}
              {canManageProject && plan.state === 'pending_review' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprovePlan(plan.id)}
                    className="rounded bg-green-600 px-3 py-1.5 text-sm text-white"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectPlan(plan.id)}
                    className="rounded bg-red-600 px-3 py-1.5 text-sm text-white"
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h3 className="mb-2 font-medium text-gray-800">AI risk assessments</h3>
        <button
          type="button"
          onClick={handleRequestRisk}
          disabled={requestingRisk}
          className="mb-4 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Request risk assessment
        </button>
        <ul className="space-y-3">
          {risks?.map((risk) => (
            <li key={risk.id} className="rounded border border-gray-200 bg-white p-4 text-sm">
              {risk.validatedOutput?.summary && <p className="mb-1">{risk.validatedOutput.summary}</p>}
              {risk.validatedOutput?.risks && (
                <ul className="list-inside list-disc text-gray-700">
                  {risk.validatedOutput.risks.map((r, index) => (
                    <li key={index}>
                      {r.description} <span className="text-xs uppercase text-gray-400">{r.severity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-medium text-gray-800">AI progress summaries</h3>
        <button
          type="button"
          onClick={handleRequestSummary}
          disabled={requestingSummary}
          className="mb-4 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Request summary
        </button>
        <ul className="space-y-3">
          {summaries?.map((summary) => (
            <li key={summary.id} className="rounded border border-gray-200 bg-white p-4 text-sm">
              {summary.validatedOutput?.summary && <p className="mb-1">{summary.validatedOutput.summary}</p>}
              {summary.validatedOutput?.highlights && (
                <ul className="list-inside list-disc text-gray-700">
                  {summary.validatedOutput.highlights.map((highlight, index) => (
                    <li key={index}>{highlight}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
