import { createContext, useContext, useMemo } from 'react';
import { readAuthProfile, type AuthProfile } from './authProfile';
import {
  canEditScreen,
  canExportReport,
  canSeeAllMedicos,
  canViewScreen,
  getDefaultRouteForGroup,
  type ReportKey,
  type ScreenKey,
} from './permissions';

interface AccessContextValue {
  profile: AuthProfile;
  canView: (screen: ScreenKey) => boolean;
  canEdit: (screen: ScreenKey) => boolean;
  canExport: (report: ReportKey) => boolean;
  isReadOnly: (screen: ScreenKey) => boolean;
  canSeeAllMedicos: boolean;
  linkedMedicoIds: number[];
  defaultRoute: string;
  filterMedicosByAccess: <T>(items: T[], getMedicoId: (item: T) => number | null | undefined) => T[];
}

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<AccessContextValue>(() => {
    const profile = readAuthProfile();

    return {
      profile,
      canView: (screen) => canViewScreen(profile.group, screen),
      canEdit: (screen) => canEditScreen(profile.group, screen),
      canExport: (report) => canExportReport(profile.group, report),
      isReadOnly: (screen) => canViewScreen(profile.group, screen) && !canEditScreen(profile.group, screen),
      canSeeAllMedicos: canSeeAllMedicos(profile.group),
      linkedMedicoIds: profile.linkedMedicoIds,
      defaultRoute: getDefaultRouteForGroup(profile.group),
      filterMedicosByAccess: (items, getMedicoId) => {
        if (canSeeAllMedicos(profile.group) || profile.linkedMedicoIds.length === 0) {
          return items;
        }

        return items.filter((item) => {
          const medicoId = getMedicoId(item);
          return typeof medicoId === 'number' && profile.linkedMedicoIds.includes(medicoId);
        });
      },
    };
  }, []);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const context = useContext(AccessContext);
  if (!context) {
    throw new Error('useAccess deve ser usado dentro de AccessProvider');
  }
  return context;
}
