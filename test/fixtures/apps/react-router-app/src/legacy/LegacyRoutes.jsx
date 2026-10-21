import { Route, Switch } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute';
import { About, Billing } from './pages';

// The routes of version 5, kept for the old billing pages.
export function LegacyRoutes() {
  return (
    <Switch>
      <PrivateRoute path="/billing" component={Billing} />
      <Route path="/about">
        <About />
      </Route>
    </Switch>
  );
}
