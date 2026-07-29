import { describe, expect, it } from "vitest";
import { parseNFeXml } from "@/lib/purchaseImport/parseNFeXml";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe35200112345678000190550010000000011000000010">
    <ide><nNF>1</nNF><serie>1</serie><dhEmi>2026-01-15T10:00:00-03:00</dhEmi><dhSaiEnt>2026-01-16T10:00:00-03:00</dhSaiEnt></ide>
    <emit><CNPJ>12345678000190</CNPJ><xNome>FORNECEDOR TESTE</xNome></emit>
    <det nItem="1"><prod>
      <cProd>ABC</cProd><cEAN>7891234567890</cEAN><xProd>PRODUTO A</xProd>
      <uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>2.5000</vUnCom><vProd>25.00</vProd>
    </prod></det>
    <total><ICMSTot><vNF>25.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;

describe("parseNFeXml", () => {
  it("extracts key, invoice, supplier and items from a string", async () => {
    const model = await parseNFeXml(SAMPLE);

    expect(model).toMatchObject({
      source: "xml",
      externalId: "35200112345678000190550010000000011000000010",
      invoiceNumber: "1",
      invoiceSeries: "1",
      issuedAt: "2026-01-15",
      receivedAt: "2026-01-16",
      supplier: { document: "12345678000190", name: "FORNECEDOR TESTE" },
      totalAmount: 25,
    });
    expect(model.items[0]).toMatchObject({
      lineKey: "1",
      supplierProductCode: "ABC",
      gtin: "7891234567890",
      name: "PRODUTO A",
      unit: "UN",
      quantity: 10,
      unitCost: 2.5,
      totalCost: 25,
    });
  });

  it("rejects XML that is not an NFe", async () => {
    await expect(parseNFeXml("<root/>")).rejects.toThrow(/NFe/i);
  });

  it("normalizes the supplier document to digits only", async () => {
    const masked = SAMPLE.replace(
      "<CNPJ>12345678000190</CNPJ>",
      "<CNPJ>12.345.678/0001-90</CNPJ>",
    );

    await expect(parseNFeXml(masked)).resolves.toMatchObject({
      supplier: { document: "12345678000190" },
    });
  });

  it("preserves a trimmed non-numeric GTIN and falls back from SEM GTIN", async () => {
    const withFallback = SAMPLE
      .replace("<cEAN>7891234567890</cEAN>", "<cEAN>SEM GTIN</cEAN><cEANTrib>  ABC-123  </cEANTrib>");

    await expect(parseNFeXml(withFallback)).resolves.toMatchObject({
      items: [expect.objectContaining({ gtin: "ABC-123" })],
    });
  });
});
