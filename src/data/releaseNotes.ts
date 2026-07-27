import releaseData from './release-notes.json';

export type ReleaseIcon = 'book' | 'help' | 'sparkles' | 'swords' | 'target';

export interface ReleaseHighlight {
  icon: ReleaseIcon;
  title: string;
  description: string;
}

export interface AppRelease {
  version: string;
  date: string;
  title: string;
  summary: string;
  highlights: ReleaseHighlight[];
}

export const APP_VERSION = __APP_VERSION__;
export const APP_RELEASES = releaseData.releases as AppRelease[];
export const CURRENT_RELEASE = APP_RELEASES.find((release) => release.version === APP_VERSION);

if (!CURRENT_RELEASE) {
  throw new Error(`Missing user-facing release notes for app version ${APP_VERSION}.`);
}