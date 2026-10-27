import React from 'react';
import { Route, Routes } from 'react-router-dom';
import DoubaoPage from './pages/doubao';
import OAuthCallback from './pages/doubao/OAuthCallback';
import NotFound from './pages/NotFound/NotFound';
const RoutesComponent: React.FC = () => <Routes>
  <Route index element={<DoubaoPage />} />
  <Route path="oauth/callback" element={<OAuthCallback />} />
  <Route path="*" element={<NotFound />} />
</Routes>;
export default RoutesComponent;
