import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
