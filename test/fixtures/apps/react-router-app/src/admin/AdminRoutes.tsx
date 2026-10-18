import { Route, Routes } from 'react-router-dom';
import { RequireAdmin } from '../auth';
import { Dashboard, Users } from './pages';

export default function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<RequireAdmin><Dashboard /></RequireAdmin>} />
      <Route path="users" element={<RequireAdmin><Users /></RequireAdmin>} />
    </Routes>
  );
}
