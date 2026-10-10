import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignupForm from './SignupForm.jsx';

describe('SignupForm', () => {
  it('submits the entered email and password', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<SignupForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ email: 'new@example.com', password: 'secret123' });
    });
  });

  it('shows the specific error message on failure (US-001 — unlike login, this is not generic)', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Email already registered'));
    render(<SignupForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dup@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Email already registered');
  });
});
