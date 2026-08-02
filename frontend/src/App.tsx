import { AppRoutes, AuthExpiryBridge } from './routes'

// The app is now the router. Auth state lives in AuthProvider (main.tsx); navigation is
// real URLs (see routes.tsx). AuthExpiryBridge wires a 401 / expired session to a
// redirect back to /login.
export default function App() {
  return (
    <>
      <AuthExpiryBridge />
      <AppRoutes />
    </>
  )
}
