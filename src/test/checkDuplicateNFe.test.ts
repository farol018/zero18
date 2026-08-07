import { beforeEach, describe, expect, it, vi } from "vitest";

const { limit, eqExternalId, eqCompanyId, select, from } = vi.hoisted(() => {
  const limit = vi.fn();
  const eqExternalId = vi.fn(() => ({ limit }));
  const eqCompanyId = vi.fn(() => ({ eq: eqExternalId }));
  const select = vi.fn(() => ({ eq: eqCompanyId }));
  const from = vi.fn(() => ({ select }));
  return { limit, eqExternalId, eqCompanyId, select, from };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from },
}));

import { findExistingPurchaseByNFeKey } from "@/lib/purchaseImport/checkDuplicateNFe";

describe("findExistingPurchaseByNFeKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes the lookup to company and NFe key across any source", async () => {
    limit.mockResolvedValueOnce({ data: [{ id: "purchase-1" }], error: null });

    await expect(findExistingPurchaseByNFeKey("company-1", "nfe-key")).resolves.toEqual({
      id: "purchase-1",
    });
    expect(from).toHaveBeenCalledWith("purchases");
    expect(select).toHaveBeenCalledWith("id");
    expect(eqCompanyId).toHaveBeenCalledWith("company_id", "company-1");
    expect(eqExternalId).toHaveBeenCalledWith("external_id", "nfe-key");
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("does not query without an NFe key", async () => {
    await expect(findExistingPurchaseByNFeKey("company-1", null)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
