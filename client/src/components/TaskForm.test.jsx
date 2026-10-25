import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskForm from './TaskForm.jsx';

describe('TaskForm (create mode)', () => {
  it('requires a title before submitting', () => {
    const onSubmit = vi.fn();
    render(<TaskForm mode="create" members={[]} submitting={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Task title is required');
  });

  it('defaults priority to Medium and submits all fields', () => {
    const onSubmit = vi.fn();
    render(<TaskForm mode="create" members={[]} submitting={false} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'New task' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New task', priority: 'medium', status: 'todo', assigneeId: null, startDate: null, dueDate: null }),
    );
  });

  it('rejects a due date earlier than the start date before calling onSubmit', () => {
    const onSubmit = vi.fn();
    render(<TaskForm mode="create" members={[]} submitting={false} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'New task' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Due date cannot be earlier than start date');
  });

  it('accepts each priority value', () => {
    const onSubmit = vi.fn();
    render(<TaskForm mode="create" members={[]} submitting={false} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Task' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'highest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ priority: 'highest' }));
  });

  it('has no labels field', () => {
    render(<TaskForm mode="create" members={[]} submitting={false} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText('Labels')).not.toBeInTheDocument();
  });

  it('disables submission while submitting', () => {
    render(<TaskForm mode="create" members={[]} submitting onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
  });
});

describe('TaskForm (edit mode)', () => {
  it('loads existing title, priority, and dates into the form', () => {
    render(
      <TaskForm
        mode="edit"
        members={[]}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        initialValues={{
          id: 't1',
          title: 'Existing task',
          priority: 'high',
          status: 'in_progress',
          startDate: '2026-11-01T00:00:00.000Z',
          dueDate: '2026-11-10T00:00:00.000Z',
          labels: ['release'],
        }}
      />,
    );
    expect(screen.getByDisplayValue('Existing task')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority')).toHaveValue('high');
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-11-10');
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(
      <TaskForm
        mode="edit"
        members={[]}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={onCancel}
        initialValues={{ id: 't1', title: 'Existing task' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
