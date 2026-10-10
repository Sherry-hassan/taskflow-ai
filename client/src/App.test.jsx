import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';

describe('App', () => {
  it('renders the TaskFlow AI heading', () => {
    render(<App />);
    expect(screen.getByText('TaskFlow AI')).toBeInTheDocument();
  });
});
