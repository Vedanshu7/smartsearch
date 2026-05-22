import { render, screen } from '@testing-library/react';
import App from './App';

test('renders search heading', () => {
  render(<App />);
  const heading = screen.getByText(/AI-Powered Smart Search/i);
  expect(heading).toBeInTheDocument();
});
