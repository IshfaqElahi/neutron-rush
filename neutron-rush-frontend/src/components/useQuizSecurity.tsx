'use client';
import { useEffect } from 'react';

export const useQuizSecurity = (onViolation: (message: string) => void) => {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      onViolation('Security trigger: inspect actions are restricted.');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const bannedKeys = ['c', 'v', 'i', 'j'];
      if (
        ((e.ctrlKey || e.metaKey) && bannedKeys.includes(e.key.toLowerCase())) ||
        e.key === 'F12'
      ) {
        e.preventDefault();
        onViolation('Security warning: copy, paste, and element inspections are locked.');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        onViolation('System warning: tab modifications flagged by monitoring system.');
      }
    };

    const preventBack = () => {
      window.history.pushState(null, '', window.location.pathname);
      onViolation('Browser back and forward movement locks are active.');
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    window.history.pushState(null, '', window.location.pathname);
    window.addEventListener('popstate', preventBack);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('popstate', preventBack);
    };
  }, [onViolation]);
};