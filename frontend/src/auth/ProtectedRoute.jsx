import { Navigate, useLocation } from 'react-router';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from './AuthContext.jsx';

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner fullScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (role && user.rol !== role) return <Navigate to="/" replace />;
  return children;
}
