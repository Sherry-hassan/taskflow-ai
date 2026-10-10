import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginForm from './LoginForm.jsx';

describe('LoginForm', () => {
  it('submits the entered email and password', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<LoginForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ email: 'a@example.com', password: 'secret123' });
    });
  });

  it('shows a generic error on failure, never revealing which field was wrong (US-002)', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('server said something field-specific'));
    render(<LoginForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Invalid email or password');
  });
});
