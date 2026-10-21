import { TestBed } from '@angular/core/testing';
import { provideRouter, Routes } from '@angular/router';

// Routes written for a test: never read as screens of the application.
const testRoutes: Routes = [{ path: 'never', component: class {} }];

describe('routes', () => {
  it('provides the router', () => {
    TestBed.configureTestingModule({ providers: [provideRouter(testRoutes)] });
    expect(TestBed).toBeTruthy();
  });
});
