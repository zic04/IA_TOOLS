import { Navigate, Route, Routes } from 'react-router-dom';
import AdminRoutes from './admin/AdminRoutes';
import { ProtectedRoute, RequireAuth } from './auth';
import { Home, Layout, Login, NotFound, OrderDetail, Orders, Settings } from './pages';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route
          path="orders"
          element={
            <RequireAuth>
              <Orders />
            </RequireAuth>
          }
        />
        <Route path="orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
        {/* <Route path="legacy" element={<Legacy />} /> */}
        <Route element={<ProtectedRoute />}>
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="old-orders" element={<Navigate to="/orders" replace />} />
        <Route path="admin/*" element={<AdminRoutes />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="/login" element={<Login />} />
    </Routes>
  );
}
