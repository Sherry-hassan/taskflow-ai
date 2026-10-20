import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import { useProjectSocket } from '../realtime/useProjectSocket.js';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import KanbanBoard from '../components/KanbanBoard.jsx';
import AiPlanPanel from '../components/ai/AiPlanPanel.jsx';
import AiRiskPanel from '../components/ai/AiRiskPanel.jsx';
import AiSummaryPanel from '../components/ai/AiSummaryPanel.jsx';
import { PlusIcon, SparkleIcon } from '../components/icons.jsx';

export default function ProjectPage() {
  const { workspaceId, projectId } = useParams();
  const { accessToken, userId, callWithAuth } = useAuth();
  const openMobileNav = useOutletContext()?.openMobileNav;

  const [role, setRole] = useState(null);
  const [workspaceName, setWorkspaceName] = useState('');
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
      setWorkspaceName(entry?.workspace.name ?? '');
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
    // A dropped connection means any task:created/updated/deleted events the
    // server emitted in the meantime were missed entirely — rejoining the
    // room alone doesn't recover them. Re-running the same full load() a
    // fresh mount uses is what actually catches this client back up.
    onReconnected: load,
  });

  const membersByEmail = useMemo(
    () => Object.fromEntries((members ?? []).map((member) => [member.userId, member.email])),
    [members],
  );

  const taskCounts = useMemo(() => {
    const list = tasks ?? [];
    return {
      total: list.length,
      todo: list.filter((t) => t.status === 'todo').length,
      in_progress: list.filter((t) => t.status === 'in_progress').length,
      done: list.filter((t) => t.status === 'done').length,
    };
  }, [tasks]);

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

  async function handleDeleteTask(taskId) {
    setError('');
    try {
      await callWithAuth(api.deleteTask, workspaceId, projectId, taskId);
      // The task:deleted socket event (already wired above) removes this for
      // every connected client, including this one — this filter is a
      // same-tick, idempotent mirror of that so the card disappears even if
      // this socket hasn't (re)joined the room yet.
      setTasks((prev) => (prev ? prev.filter((t) => t.id !== taskId) : prev));
    } catch (err) {
      if (err.status === 404) {
        // Already gone (e.g. deleted from another tab/session) — treat as
        // success rather than showing an error for something the user's
        // click already achieved in effect.
        setTasks((prev) => (prev ? prev.filter((t) => t.id !== taskId) : prev));
        return;
      }
      setError(err.message || 'Failed to delete task');
      // Re-thrown so TaskCard's dialog knows the attempt failed (it only
      // uses this to stop showing "Deleting…" — the error itself is
      // surfaced via the banner above, not by the dialog).
      throw err;
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
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Workspaces', to: '/' },
          { label: workspaceName || 'Workspace', to: `/workspaces/${workspaceId}` },
          { label: project?.name ?? 'Project' },
        ]}
        title={project?.name ?? 'Project'}
        onOpenMenu={openMobileNav}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total tasks" value={tasks === null ? '–' : taskCounts.total} />
          <StatCard label="To Do" value={tasks === null ? '–' : taskCounts.todo} accent="amber" />
          <StatCard label="In Progress" value={tasks === null ? '–' : taskCounts.in_progress} accent="blue" />
          <StatCard label="Done" value={tasks === null ? '–' : taskCounts.done} accent="emerald" />
        </div>

        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Board</h2>
          </div>
          <form onSubmit={handleCreateTask} className="mb-5 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="task-title" className="mb-1 block text-xs font-medium text-slate-500">
                Task title
              </label>
              <input
                id="task-title"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="New task title"
                required
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label htmlFor="task-assignee" className="mb-1 block text-xs font-medium text-slate-500">
                Assignee
              </label>
              <select
                id="task-assignee"
                value={taskAssigneeId}
                onChange={(event) => setTaskAssigneeId(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">Unassigned</option>
                {members?.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.email}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={creatingTask}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <PlusIcon className="h-4 w-4" />
              {creatingTask ? 'Adding…' : 'Add task'}
            </button>
          </form>

          {tasks === null && <p className="text-sm text-slate-500">Loading…</p>}
          {tasks !== null && tasks.length === 0 && <p className="text-sm text-slate-500">No tasks yet.</p>}
          {tasks !== null && tasks.length > 0 && (
            <KanbanBoard
              tasks={tasks}
              currentUserId={userId}
              currentRole={role}
              membersByEmail={membersByEmail}
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteTask}
            />
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <SparkleIcon className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-900">AI Command Center</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <AiPlanPanel
                goalDescription={goalDescription}
                onGoalDescriptionChange={setGoalDescription}
                onSubmit={handleRequestPlan}
                requesting={requestingPlan}
                error={planError}
                plans={plans}
                canManageProject={canManageProject}
                onApprove={handleApprovePlan}
                onReject={handleRejectPlan}
              />
            </div>
            <AiRiskPanel onRequest={handleRequestRisk} requesting={requestingRisk} risks={risks} />
            <AiSummaryPanel onRequest={handleRequestSummary} requesting={requestingSummary} summaries={summaries} />
          </div>
        </section>
      </main>
    </>
  );
}
