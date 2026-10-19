import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Shell } from './shell/shell';
import { TooltipProvider } from './ui/tooltip';

const root = document.getElementById('root');
if (!root) throw new Error('Studio needs a #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <Shell />
    </TooltipProvider>
  </StrictMode>,
);
