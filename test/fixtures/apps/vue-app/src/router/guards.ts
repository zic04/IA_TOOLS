import type { NavigationGuard } from 'vue-router';
import { useSession } from '../stores/session';

export const requireAuth: NavigationGuard = (to) => {
  const session = useSession();
  return session.signedIn ? true : { path: '/login', query: { next: to.fullPath } };
};
