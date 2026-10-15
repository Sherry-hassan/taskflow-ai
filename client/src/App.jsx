import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import AppLayout from './components/AppLayout.jsx';
import SignupPage from './pages/SignupPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import WorkspacesPage from './pages/WorkspacesPage.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import InvitationAcceptPage from './pages/InvitationAcceptPage.jsx';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<WorkspacesPage />} />
            <Route path="workspaces/:workspaceId" element={<WorkspacePage />} />
            <Route path="workspaces/:workspaceId/projects/:projectId" element={<ProjectPage />} />
            <Route path="invitations/:token/accept" element={<InvitationAcceptPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
