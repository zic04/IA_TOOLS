import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Routes written for a test: never read as screens of the application.
it('renders', () => {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/never" element={<div />} />
      </Routes>
    </MemoryRouter>,
  );
});
