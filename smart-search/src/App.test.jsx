import { render, screen } from '@testing-library/react';
import App from './App';

test('renders home view', () => {
  render(<App />);
  expect(screen.getByText(/Describe what you want to find/i)).toBeInTheDocument();
});
