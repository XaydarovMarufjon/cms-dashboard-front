import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { SideNavComponent } from './shared/side-nav/side-nav.component';

@Component({ selector: 'app-side-nav', template: '' })
class SideNavStub {}

@Component({ template: '<p data-testid="route-content">Page content</p>' })
class RouteStub {}

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let router: Router;
  let loggedIn: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    loggedIn = signal(false);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: 'tasks', component: RouteStub },
          { path: 'login', component: RouteStub },
        ]),
        { provide: AuthService, useValue: { isLoggedIn: loggedIn, refresh: () => of({}) } },
        { provide: ThemeService, useValue: {} },
      ],
    })
      .overrideComponent(App, {
        remove: { imports: [SideNavComponent] },
        add: { imports: [SideNavStub] },
      })
      .compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
  });

  async function navigate(url: string) {
    await router.navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders routed content without a shell when logged out', async () => {
    await navigate('/tasks');

    expect(fixture.componentInstance).toBeTruthy();
    expect(element().querySelector('[data-testid="route-content"]')?.textContent).toBe('Page content');
    expect(element().querySelector('.app-shell')).toBeNull();
    expect(element().querySelector('app-side-nav')).toBeNull();
  });

  it('renders one sidebar and routed content inside the authenticated shell', async () => {
    loggedIn.set(true);
    await navigate('/tasks');

    expect(element().querySelectorAll('app-side-nav')).toHaveLength(1);
    expect(element().querySelector('.app-shell-content [data-testid="route-content"]')).not.toBeNull();
  });

  it('hides the shell on login and restores it when navigating back', async () => {
    loggedIn.set(true);
    await navigate('/tasks');
    await navigate('/login?returnUrl=%2Ftasks');

    expect(element().querySelector('.app-shell')).toBeNull();
    expect(element().querySelector('app-side-nav')).toBeNull();
    expect(element().querySelector('[data-testid="route-content"]')).not.toBeNull();

    await navigate('/tasks');

    expect(element().querySelectorAll('app-side-nav')).toHaveLength(1);
    expect(element().querySelector('.app-shell-content [data-testid="route-content"]')).not.toBeNull();
  });

  it('removes the shell when login state changes without navigation', async () => {
    loggedIn.set(true);
    await navigate('/tasks');

    loggedIn.set(false);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element().querySelector('.app-shell')).toBeNull();
    expect(element().querySelector('app-side-nav')).toBeNull();
    expect(element().querySelector('[data-testid="route-content"]')).not.toBeNull();
  });
});
