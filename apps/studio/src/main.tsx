import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Shell } from './shell/shell';
import { Toaster } from './ui/toast';
import { TooltipProvider } from './ui/tooltip';

const root = document.getElementById('root');
if (!root) throw new Error('Studio needs a #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <Shell />
      <Toaster />
    </TooltipProvider>
  </StrictMode>,
);
