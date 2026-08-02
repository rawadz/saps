import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../routes'
import { AuthProvider } from '../auth/AuthContext'

// Screens fire data loads on mount; stub fetch to a resolved empty list so they render
// their synchronous chrome without network noise or unhandled rejections.
function stubFetchOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ items: [], total: 0, page: 1, pageSize: 10 }),
      json: async () => ({ items: [], total: 0, page: 1, pageSize: 10 }),
    })),
  )
}

function seedSession(role: string) {
  sessionStorage.setItem(
    'esaps.auth',
    JSON.stringify({ accessToken: 'test-token', role }),
  )
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('routing', () => {
  beforeEach(() => {
    sessionStorage.clear()
    stubFetchOk()
  })

  it('redirects an unauthenticated deep-link to /login', async () => {
    renderAt('/employees')
    // The login screen subtitle proves we were bounced to /login.
    expect(await screen.findByText('تسجيل الدخول')).toBeInTheDocument()
  })

  it('restores a deep-linked screen for an authorized role (refresh survives)', async () => {
    seedSession('super_admin')
    renderAt('/employees')
    // The Employees search box (relabelled) confirms the Employees screen rendered.
    expect(
      await screen.findByText('بحث بالاسم أو الرقم الوظيفي'),
    ).toBeInTheDocument()
  })

  it('blocks a forbidden route and lands on the role home', async () => {
    seedSession('permit_officer') // not allowed on /users
    renderAt('/users')
    // Redirected to '/' → the dashboard hub, NOT the Users screen.
    expect(await screen.findByText('لوحة التحكّم')).toBeInTheDocument()
  })
})
