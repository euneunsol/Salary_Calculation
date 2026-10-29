import type { ReactNode } from 'react';

export type IconName = 'home' | 'calendar' | 'wallet' | 'store' | 'users' | 'clock' | 'badge' | 'check' | 'arrow' | 'chevronLeft' | 'chevronRight' | 'plus' | 'x';

const PATHS: Record<IconName, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5M9 21v-7h6v7" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  wallet: <><path d="M4 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13" /><path d="M16 12h5M16 15h5" /></>,
  store: <><path d="M4 10v11h16V10M3 10l2-7h14l2 7" /><path d="M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2M9 21v-6h6v6" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  badge: <><path d="m12 3 2.2 2.2 3-.6.6 3L20 9.8 17.8 12 20 14.2l-2.2 2.2-.6 3-3-.6L12 21l-2.2-2.2-3 .6-.6-3L4 14.2 6.2 12 4 9.8l2.2-2.2.6-3 3 .6Z" /><circle cx="12" cy="12" r="2.6" /></>,
  check: <path d="m5 13 4 4L19 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
};

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {PATHS[name]}
    </svg>
  );
}
