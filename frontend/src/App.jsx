import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthContext.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import CrudPage from './pages/CrudPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import InscripcionMultiple from './pages/InscripcionMultiple.jsx';
import Login from './pages/Login.jsx';
import Marcador from './pages/Marcador.jsx';
import NotFound from './pages/NotFound.jsx';
import { resources } from './resources.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/combates/:id/marcador"
            element={
              <ProtectedRoute>
                <Marcador />
              </ProtectedRoute>
            }
          />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="inscripciones/multiple" element={<InscripcionMultiple />} />
            {resources.map((r) => (
              <Route
                key={r.path}
                path={r.path}
                element={
                  <ProtectedRoute role={r.adminOnly ? 'admin' : undefined}>
                    <CrudPage key={r.path} resource={r} />
                  </ProtectedRoute>
                }
              />
            ))}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
