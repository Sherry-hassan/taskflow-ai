import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskCard from './TaskCard.jsx';

const baseTask = {
  id: 't1',
  title: 'Write tests',
  status: 'todo',
  createdBy: 'creator-id',
  assigneeId: 'assignee-id',
};

describe('TaskCard (US-036/039 — status-change UI reflects task authority)', () => {
  it('offers the status control to the creator', () => {
    render(<TaskCard task={baseTask} currentUserId="creator-id" currentRole="member" onStatusChange={vi.fn()} />);
    expect(screen.getByLabelText('Status for Write tests')).toBeInTheDocument();
  });

  it('offers the status control to the current assignee', () => {
    render(<TaskCard task={baseTask} currentUserId="assignee-id" currentRole="member" onStatusChange={vi.fn()} />);
    expect(screen.getByLabelText('Status for Write tests')).toBeInTheDocument();
  });

  it('offers the status control to an Owner/Admin even if unrelated to the task', () => {
    render(<TaskCard task={baseTask} currentUserId="someone-else" currentRole="owner" onStatusChange={vi.fn()} />);
    expect(screen.getByLabelText('Status for Write tests')).toBeInTheDocument();
  });

  it('does NOT offer the status control to an unrelated Member', () => {
    render(<TaskCard task={baseTask} currentUserId="someone-else" currentRole="member" onStatusChange={vi.fn()} />);
    expect(screen.queryByLabelText('Status for Write tests')).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent("don't have permission");
  });

  it('calls onStatusChange with the task id and new status', () => {
    const onStatusChange = vi.fn();
    render(<TaskCard task={baseTask} currentUserId="creator-id" currentRole="member" onStatusChange={onStatusChange} />);
    fireEvent.change(screen.getByLabelText('Status for Write tests'), { target: { value: 'done' } });
    expect(onStatusChange).toHaveBeenCalledWith('t1', 'done');
  });
});

describe('TaskCard delete (FR-031 — delete authority mirrors status-change authority)', () => {
  it('offers the delete control to the creator', () => {
    render(<TaskCard task={baseTask} currentUserId="creator-id" currentRole="member" onStatusChange={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByLabelText('Delete Write tests')).toBeInTheDocument();
  });

  it('does NOT offer the delete control to an unrelated Member', () => {
    render(<TaskCard task={baseTask} currentUserId="someone-else" currentRole="member" onStatusChange={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByLabelText('Delete Write tests')).not.toBeInTheDocument();
  });

  it('does not call onDelete until the confirmation dialog is confirmed', () => {
    const onDelete = vi.fn();
    render(<TaskCard task={baseTask} currentUserId="creator-id" currentRole="member" onStatusChange={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Delete Write tests'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('calls onDelete with the task id when confirmed', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<TaskCard task={baseTask} currentUserId="creator-id" currentRole="member" onStatusChange={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Delete Write tests'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('t1'));
  });

  it('cancelling the dialog makes no call to onDelete and closes it', () => {
    const onDelete = vi.fn();
    render(<TaskCard task={baseTask} currentUserId="creator-id" currentRole="member" onStatusChange={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Delete Write tests'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables both dialog buttons and relabels Delete while the request is in flight', async () => {
    let resolveDelete;
    const onDelete = vi.fn(() => new Promise((resolve) => { resolveDelete = resolve; }));
    render(<TaskCard task={baseTask} currentUserId="creator-id" currentRole="member" onStatusChange={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Delete Write tests'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    resolveDelete();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
