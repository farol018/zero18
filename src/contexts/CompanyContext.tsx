import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type CompanyState = {
  companyId: string | null;
  companyName: string | null;
  coverageDays: number;
  consumptionWindowDays: number;
  lastSyncAt: string | null;
  isLoading: boolean;
  error: string | null;
  refreshCompany: () => Promise<void>;
};

const CompanyContext = createContext<CompanyState | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [coverageDays, setCoverageDays] = useState(7);
  const [consumptionWindowDays, setConsumptionWindowDays] = useState(7);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCompany = async (targetCompanyId: string) => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, coverage_days, consumption_window_days, last_sync_at")
      .eq("id", targetCompanyId)
      .maybeSingle();

    if (companyError) throw companyError;

    if (company) {
      setCompanyName(company.name);
      setCoverageDays(company.coverage_days ?? 7);
      setConsumptionWindowDays(company.consumption_window_days ?? 7);
      setLastSyncAt(company.last_sync_at ?? null);
      return;
    }

    setCompanyName(null);
    setCoverageDays(7);
    setConsumptionWindowDays(7);

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

  const resolveFromSession = async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const user = sessionData.session?.user;
    if (!user) {
      setCompanyId(null);
      setCompanyName(null);
      setError(null);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(
        `Falha ao ler profiles (${profileError.code ?? "?"}): ${profileError.message}`,
      );
    }

    if (!profile?.company_id) {
      setCompanyId(null);
      setCompanyName(null);
      setError(
        profile
          ? "Seu perfil existe, mas company_id está vazio. Atualize public.profiles."
          : `Perfil não encontrado para o usuário ${user.id} (e-mail: ${user.email ?? "?"} ). Verifique RLS em profiles e se id = auth.uid().`,
      );
      return;
    }

    setError(null);
    setCompanyId(profile.company_id);
    await loadCompany(profile.company_id);
  };

  const refreshCompany = async () => {
    if (!companyId) return;
    await loadCompany(companyId);
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setIsLoading(true);
      try {
        await resolveFromSession();
      } catch (e) {
        if (!cancelled) {
          setCompanyId(null);
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível carregar a empresa. Faça login novamente.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setCompanyId(null);
        setCompanyName(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      void resolveFromSession()
        .catch((e) => {
          setCompanyId(null);
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível carregar a empresa. Faça login novamente.",
          );
        })
        .finally(() => setIsLoading(false));
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
      error,
      refreshCompany,
    }),
    [companyId, companyName, coverageDays, consumptionWindowDays, lastSyncAt, isLoading, error],
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
