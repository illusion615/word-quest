import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import WordBuddyApp from './WordBuddyApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WordBuddyApp />
  </StrictMode>,
);
