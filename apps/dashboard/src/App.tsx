import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth-context.js';
import { ToastProvider } from './components/Toast.js';
import { WebSocketProvider } from './lib/websocket.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { Layout } from './components/Layout.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { AgentsPage } from './pages/AgentsPage.js';
import { WorkflowsPage } from './pages/WorkflowsPage.js';
import { TeamsPage } from './pages/TeamsPage.js';
import { TeamDetailPage } from './pages/TeamDetailPage.js';
import { KanbanPage } from './pages/KanbanPage.js';
import { MessagingPage } from './pages/MessagingPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { TemplatesPage } from './pages/TemplatesPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { WorkflowEditorPage } from './pages/WorkflowEditorPage.js';

export function App(){
  return (
    <AuthProvider>
    <WebSocketProvider>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected routes — wrapped in sidebar Layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/teams/:teamUuid" element={<TeamDetailPage />} />
            <Route path="/teams/:teamUuid/kanban" element={<KanbanPage />} />
            <Route path="/teams/:teamUuid/chat" element={<MessagingPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/workflow-editor" element={<WorkflowEditorPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
    </WebSocketProvider>
    </AuthProvider>
  );
}
