import { render, screen } from '@testing-library/react';
import App from './App';

test('renders home view search input', () => {
  render(<App />);
  expect(screen.getByPlaceholderText(/Describe what you want to find/i)).toBeInTheDocument();
});
