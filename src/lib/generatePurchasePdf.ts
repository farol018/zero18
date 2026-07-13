import jsPDF from "jspdf";
import { FarolItem } from "@/hooks/useFarolInteligencia";

type Group = { label: string; color: [number, number, number]; items: FarolItem[] };

export async function generatePurchasePdf(items: FarolItem[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 25;

  // Logo
  try {
    const logoImg = new Image();
    logoImg.crossOrigin = "anonymous";
    logoImg.src = "/images/farol-logo.png";
    await new Promise<void>((resolve, reject) => {
      logoImg.onload = () => resolve();
      logoImg.onerror = () => reject();
    });
    const canvas = document.createElement("canvas");
    canvas.width = logoImg.naturalWidth;
    canvas.height = logoImg.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(logoImg, 0, 0);
    const logoData = canvas.toDataURL("image/png");
    const logoH = 10;
    const logoW = (logoImg.naturalWidth / logoImg.naturalHeight) * logoH;
    doc.addImage(logoData, "PNG", margin, y - 6, logoW, logoH);
    y += logoH + 4;
  } catch {
    // Fallback text if logo fails
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("FAROL", margin, y);
    y += 8;
  }

  // Header
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Lista de Compra", margin, y);
  y += 6;

  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const totalUnits = items.reduce((s, i) => s + Math.round(i.sugestao_compra ?? 0), 0);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Data: ${dateStr}`, margin, y);
  y += 5;
  doc.text(`Total: ${items.length} produto${items.length !== 1 ? "s" : ""} | ${totalUnits} unidades`, margin, y);
  y += 8;

  doc.setDrawColor(200);
  doc.line(margin, y, w - margin, y);
  y += 6;

  // Group items
  const red = items.filter(i => (i.dias_estoque ?? 0) <= 0 && !((i.estoque_atual ?? 0) === 0 && (i.consumo_medio_dia ?? 0) === 0) && (i.estoque_atual ?? 0) >= 0);
  const yellow = items.filter(i => (i.dias_estoque ?? 0) > 0 && (i.dias_estoque ?? 0) <= 3);
  const green = items.filter(i => (i.dias_estoque ?? 0) > 3);

  const groups: Group[] = [
    { label: "URGENTE (sem estoque)", color: [220, 38, 38], items: red },
    { label: "ATENÇÃO (acaba em poucos dias)", color: [202, 138, 4], items: yellow },
    { label: "REPOSIÇÃO", color: [22, 163, 74], items: green },
  ];

  for (const group of groups) {
    if (group.items.length === 0) continue;

    if (y > 255) { doc.addPage(); y = 20; }

    // Group header with colored bar
    doc.setFillColor(...group.color);
    doc.rect(margin, y - 3.5, 3, 5, "F");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...group.color);
    doc.text(group.label, margin + 6, y);
    y += 3;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    const groupUnits = group.items.reduce((s, i) => s + Math.round(i.sugestao_compra ?? 0), 0);
    doc.text(`${group.items.length} produto${group.items.length !== 1 ? "s" : ""} · ${groupUnits} un.`, margin + 6, y);
    y += 6;

    // Items
    doc.setTextColor(50);
    doc.setFontSize(9);

    for (const item of group.items) {
      if (y > 275) { doc.addPage(); y = 20; }

      const qty = Math.round(item.sugestao_compra ?? 0);
      doc.setFont("helvetica", "normal");
      doc.text(`${item.product_name}`, margin + 4, y);

      let rightText = `${qty} un.`;
      const dias = Math.round(item.dias_estoque ?? 0);
      if (dias > 0 && dias <= 3) {
        rightText += ` · ${dias} dia${dias !== 1 ? "s" : ""}`;
      }

      doc.setFont("helvetica", "bold");
      doc.text(rightText, w - margin, y, { align: "right" });
      y += 6;
    }

    y += 4;
  }

  // Footer
  y += 2;
  doc.setDrawColor(200);
  doc.line(margin, y, w - margin, y);
  y += 5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150);
  doc.text(`Gerado por FAROL em ${dateStr}`, margin, y);

  const fileName = `farol_lista_compra_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.pdf`;
  doc.save(fileName);
}
