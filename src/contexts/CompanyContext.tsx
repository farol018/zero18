import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type CompanyState = {
  companyId: string;
  companyName: string | null;
  coverageDays: number;
  consumptionWindowDays: number;
  lastSyncAt: string | null;
  isLoading: boolean;
  refreshCompany: () => Promise<void>;
};

const DEFAULT_COMPANY_ID =
  import.meta.env.VITE_COMPANY_ID ?? "04c9b2c3-1c6e-439b-949a-486e4917b13c";

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === "true";

const CompanyContext = createContext<CompanyState | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyId] = useState(DEFAULT_COMPANY_ID);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [coverageDays, setCoverageDays] = useState(7);
  const [consumptionWindowDays, setConsumptionWindowDays] = useState(7);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCompany = async (targetCompanyId: string) => {
    const { data: company, error } = await supabase
      .from("companies")
      .select("id, name, coverage_days, consumption_window_days, last_sync_at")
      .eq("id", targetCompanyId)
      .maybeSingle();

    if (error) throw error;

    if (company) {
      setCompanyName(company.name);
      setCoverageDays(company.coverage_days ?? 7);
      setConsumptionWindowDays(company.consumption_window_days ?? 7);
      setLastSyncAt(company.last_sync_at ?? null);
      return;
    }

    const { data: lastJob } = await supabase
      .from("import_jobs")
      .select("finished_at")
      .eq("company_id", targetCompanyId)
      .eq("status", "completed")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setLastSyncAt(lastJob?.finished_at ?? null);
  };

  const refreshCompany = async () => {
    await loadCompany(companyId);
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setIsLoading(true);
      try {
        let targetCompanyId = DEFAULT_COMPANY_ID;

        if (!SKIP_AUTH) {
          const { data: sessionData } = await supabase.auth.getSession();

          if (sessionData.session?.user) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("company_id")
              .eq("id", sessionData.session.user.id)
              .maybeSingle();

            if (profile?.company_id) {
              targetCompanyId = profile.company_id;
            }
          }
        }

        if (!cancelled) {
          setCompanyId(targetCompanyId);
          await loadCompany(targetCompanyId);
        }
      } catch {
        if (!cancelled) {
          setCompanyId(DEFAULT_COMPANY_ID);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (SKIP_AUTH || !session?.user) return;
      void supabase
        .from("profiles")
        .select("company_id")
        .eq("id", session.user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (profile?.company_id) {
            setCompanyId(profile.company_id);
            void loadCompany(profile.company_id);
          }
        });
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      companyId,
      companyName,
      coverageDays,
      consumptionWindowDays,
      lastSyncAt,
      isLoading,
      refreshCompany,
    }),
    [companyId, companyName, coverageDays, consumptionWindowDays, lastSyncAt, isLoading],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error("useCompany must be used within CompanyProvider");
  }
  return ctx;
}
