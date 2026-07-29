import { beforeEach, describe, expect, it, vi } from "vitest";

const { maybeSingle, eqExternalId, eqSource, eqCompanyId, select, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eqExternalId = vi.fn(() => ({ maybeSingle }));
  const eqSource = vi.fn(() => ({ eq: eqExternalId }));
  const eqCompanyId = vi.fn(() => ({ eq: eqSource }));
  const select = vi.fn(() => ({ eq: eqCompanyId }));
  const from = vi.fn(() => ({ select }));
  return { maybeSingle, eqExternalId, eqSource, eqCompanyId, select, from };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from },
}));

import { findExistingPurchaseByNFeKey } from "@/lib/purchaseImport/checkDuplicateNFe";

describe("findExistingPurchaseByNFeKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes the lookup to company, source xml and NFe key", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: "purchase-1" }, error: null });

    await expect(findExistingPurchaseByNFeKey("company-1", "nfe-key")).resolves.toEqual({
      id: "purchase-1",
    });
    expect(from).toHaveBeenCalledWith("purchases");
    expect(select).toHaveBeenCalledWith("id");
    expect(eqCompanyId).toHaveBeenCalledWith("company_id", "company-1");
    expect(eqSource).toHaveBeenCalledWith("source", "xml");
    expect(eqExternalId).toHaveBeenCalledWith("external_id", "nfe-key");
  });

  it("does not query without an NFe key", async () => {
    await expect(findExistingPurchaseByNFeKey("company-1", null)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
