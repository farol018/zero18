import { describe, it, expect } from "vitest";
import type { Database } from "@/integrations/supabase/types";

type Brand = Database["public"]["Tables"]["brands"]["Row"];
type Category = Database["public"]["Tables"]["categories"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];

describe("FEATURE 007 commercial structure contract", () => {
  it("brands não exige external_id (BLING manda string)", () => {
    const brand: Brand = {
      id: "1",
      company_id: "2",
      name: "Casa Silva",
      active: true,
      created_at: "2026-07-29T00:00:00.000Z",
      updated_at: "2026-07-29T00:00:00.000Z",
    };
    expect(brand.name).toBe("Casa Silva");
    expect("external_id" in brand).toBe(false);
  });

  it("categories possui external_id e parent_id para sync BLING", () => {
    const category: Category = {
      id: "1",
      company_id: "2",
      name: "Tintos",
      external_id: "99",
      parent_id: null,
      active: true,
      created_at: "2026-07-29T00:00:00.000Z",
      updated_at: "2026-07-29T00:00:00.000Z",
    };
    expect(category.external_id).toBe("99");
    expect(category.parent_id).toBeNull();
  });

  it("products possui brand_id e category_id", () => {
    const keys: Array<keyof Product> = ["brand_id", "category_id"];
    expect(keys).toContain("brand_id");
    expect(keys).toContain("category_id");
  });
});
