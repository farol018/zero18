import jsPDF from "jspdf";
import type { SupplierGroup } from "@/hooks/useFarol";
import { formatProductLabel } from "@/lib/formatProduct";

export function generateSupplierPdf(group: SupplierGroup) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 25;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Pedido de compra", margin, y);
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(`Fornecedor: ${group.supplier_name}`, margin, y);
  y += 6;

  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Data: ${dateStr}`, margin, y);
  y += 8;

  doc.setDrawColor(200);
  doc.line(margin, y, w - margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(40);

  for (const item of group.items) {
    if (y > 270) { doc.addPage(); y = 20; }

    const qty = Math.round(item.sugestao_compra ?? 0);
    const status = (item.status_estoque ?? "").toLowerCase();
    let badge = "";
    if (status.includes("ruptura")) badge = "[SEM ESTOQUE] ";
    else if (status.includes("risco")) badge = "[RISCO] ";
    else if (status.includes("atenção")) badge = "[ATENÇÃO] ";

    doc.setFont("helvetica", "normal");
    doc.text(`• ${badge}${formatProductLabel(item)}`, margin + 2, y);
    doc.setFont("helvetica", "bold");
    doc.text(`${qty} un.`, w - margin, y, { align: "right" });
    y += 7;
  }

  y += 4;
  doc.setDrawColor(200);
  doc.line(margin, y, w - margin, y);
  y += 6;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(`Total: ${group.totalUnits} unidades`, margin, y);

  y += 10;
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150);
  doc.text(`Gerado por FAROL em ${dateStr}`, margin, y);

  const safeName = group.supplier_name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  doc.save(`pedido_${safeName}.pdf`);
}
