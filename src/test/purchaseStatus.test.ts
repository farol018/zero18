import { describe, expect, it } from "vitest";
import {
  canCancelPurchase,
  canConfirmPurchase,
  canDeletePurchase,
  canEditPurchase,
} from "@/lib/purchaseStatus";

describe("FEATURE 009 purchaseStatus", () => {
  it("draft is fully editable and deletable", () => {
    expect(canEditPurchase("draft")).toBe(true);
    expect(canDeletePurchase("draft")).toBe(true);
    expect(canConfirmPurchase("draft")).toBe(true);
    expect(canCancelPurchase("draft")).toBe(false);
  });

  it("confirmed is immutable except cancel", () => {
    expect(canEditPurchase("confirmed")).toBe(false);
    expect(canDeletePurchase("confirmed")).toBe(false);
    expect(canConfirmPurchase("confirmed")).toBe(false);
    expect(canCancelPurchase("confirmed")).toBe(true);
  });

  it("cancelled is read-only", () => {
    expect(canEditPurchase("cancelled")).toBe(false);
    expect(canDeletePurchase("cancelled")).toBe(false);
    expect(canConfirmPurchase("cancelled")).toBe(false);
    expect(canCancelPurchase("cancelled")).toBe(false);
  });
});
