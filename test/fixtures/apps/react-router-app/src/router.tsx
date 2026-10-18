import { createBrowserRouter, Navigate } from 'react-router-dom';
import { requireUser } from './auth';
import { Cart, Catalog, ShopLayout } from './shop';

export const router = createBrowserRouter([
  {
    path: '/shop',
    element: <ShopLayout />,
    loader: requireUser,
    children: [
      { index: true, element: <Catalog /> },
      { path: 'cart', Component: Cart },
      { path: 'checkout', lazy: () => import('./shop/checkout') },
      // { path: 'wishlist', element: <Wishlist /> },
      { path: 'old', element: <Navigate to="/shop" /> },
    ],
  },
]);
