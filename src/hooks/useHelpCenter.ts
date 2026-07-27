import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_VERSION } from '../data/releaseNotes';

export type HelpSection = 'guide' | 'updates';

const SEEN_RELEASE_KEY = 'wordquest.whats-new.seen.v1';
const GUIDE_COMPLETE_KEY = 'wordquest.guide.complete.v1';

interface HelpCenterState {
  open: boolean;
  section: HelpSection;
  celebrate: boolean;
}

const CLOSED_STATE: HelpCenterState = {
  open: false,
  section: 'guide',
  celebrate: false,
};

export function shouldShowWhatsNew(seenVersion: string | null): boolean {
  return seenVersion !== APP_VERSION;
}

export function shouldShowOnboarding(isNewUser: boolean, guideComplete: string | null): boolean {
  return isNewUser && guideComplete !== 'true';
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
    return;
  } catch {
    // Fall back to this browser session when durable storage is unavailable.
  }
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // The in-memory state still prevents another display before unmounting.
  }
}

export function useHelpCenter(ready: boolean, isNewUser: boolean) {
  const [state, setState] = useState<HelpCenterState>(CLOSED_STATE);
  const initializedRef = useRef(false);
  const sectionRef = useRef<HelpSection>('guide');
  const guideAfterUpdatesRef = useRef(false);

  useEffect(() => {
    if (!ready || initializedRef.current) return;
    initializedRef.current = true;
    const showUpdates = shouldShowWhatsNew(readStored(SEEN_RELEASE_KEY));
    const showGuide = shouldShowOnboarding(isNewUser, readStored(GUIDE_COMPLETE_KEY));
    if (showUpdates) {
      writeStored(SEEN_RELEASE_KEY, APP_VERSION);
      guideAfterUpdatesRef.current = showGuide;
      sectionRef.current = 'updates';
      setState({ open: true, section: 'updates', celebrate: true });
      return;
    }
    if (showGuide) {
      sectionRef.current = 'guide';
      setState({ open: true, section: 'guide', celebrate: false });
    }
  }, [isNewUser, ready]);

  const openHelp = useCallback((section: HelpSection = 'guide') => {
    sectionRef.current = section;
    setState({ open: true, section, celebrate: false });
  }, []);

  const closeHelp = useCallback(() => {
    if (sectionRef.current === 'updates' && guideAfterUpdatesRef.current) {
      guideAfterUpdatesRef.current = false;
      sectionRef.current = 'guide';
      setState({ open: true, section: 'guide', celebrate: false });
      return;
    }
    if (sectionRef.current === 'guide') writeStored(GUIDE_COMPLETE_KEY, 'true');
    setState(CLOSED_STATE);
  }, []);

  const setSection = useCallback((section: HelpSection) => {
    sectionRef.current = section;
    if (section === 'guide') guideAfterUpdatesRef.current = false;
    setState((current) => ({ ...current, section, celebrate: false }));
  }, []);

  return {
    ...state,
    openHelp,
    closeHelp,
    setSection,
  };
}