import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/lilita-one/400.css';
import './styles.css';
import WordBuddyApp from './WordBuddyApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WordBuddyApp />
  </StrictMode>,
);
