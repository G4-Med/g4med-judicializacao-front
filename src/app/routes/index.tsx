import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../layout/MainLayout';
import { DashboardPage } from '../../pages/dashboard/DashboardPage';
import { ProcessosPage } from '../../pages/processos/ProcessosPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="processos" element={<ProcessosPage />} />
      </Route>
    </Routes>
  );
}