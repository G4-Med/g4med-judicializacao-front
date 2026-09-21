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
    const grupos = profile.groups?.length ? profile.groups : [profile.group];

    return {
      profile,
      // Pessoa com 2 grupos (ex.: Gerente + Jurídico) soma as permissões: vê o que QUALQUER grupo
      // dela vê e edita o que QUALQUER um edita. O servidor já decidia assim (grupos, não grupo).
      canView: (screen) => grupos.some((g) => canViewScreen(g, screen)),
      canEdit: (screen) => grupos.some((g) => canEditScreen(g, screen)),
      canExport: (report) => grupos.some((g) => canExportReport(g, report)),
      isReadOnly: (screen) => grupos.some((g) => canViewScreen(g, screen)) && !grupos.some((g) => canEditScreen(g, screen)),
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
