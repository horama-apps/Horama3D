import type { Currency } from './printingCalculator.types';
import { formatCurrency } from './printingCalculator.utils';

export interface PrintingQuoteProduct {
  name: string;
  quantity: number;
  commercialPrice: number;
  unitPrice: number;
  totalHours: number;
  currency: Currency;
}

export interface PrintingQuotePdfInput {
  quoteNumber: string;
  customer: string;
  date: string;
  products: PrintingQuoteProduct[];
}

function formatQuoteDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

export async function createPrintingQuotePdf(
  input: PrintingQuotePdfInput,
  logoDataUrl: string,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageWidth = 210;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const green = [47, 143, 131] as const;
  const dark = [31, 34, 37] as const;
  const muted = [103, 111, 106] as const;

  const drawHeader = () => {
    pdf.setFillColor(...green);
    pdf.rect(0, 0, pageWidth, 6, 'F');
    pdf.addImage(logoDataUrl, 'PNG', margin, 14, 31, 31);
    pdf.setTextColor(...dark);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(19);
    pdf.text('HORAMA 3D', 54, 25);
    pdf.setTextColor(...green);
    pdf.setFontSize(9);
    pdf.text('IMPRESION 3D A TU MEDIDA', 54, 31);
    pdf.setTextColor(...muted);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text('Cotizacion de productos', 54, 37);

    pdf.setTextColor(...dark);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.text('COTIZACION', pageWidth - margin, 22, { align: 'right' });
    pdf.setTextColor(...muted);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text(`Folio: ${input.quoteNumber}`, pageWidth - margin, 29, {
      align: 'right',
    });
    pdf.text(`Fecha: ${formatQuoteDate(input.date)}`, pageWidth - margin, 35, {
      align: 'right',
    });
  };

  drawHeader();

  pdf.setDrawColor(218, 222, 218);
  pdf.line(margin, 51, pageWidth - margin, 51);
  pdf.setTextColor(...muted);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('PREPARADO PARA', margin, 59);
  pdf.setTextColor(...dark);
  pdf.setFontSize(11);
  pdf.text(input.customer.trim() || 'Cliente', margin, 66);

  let y = 79;
  const drawTableHeader = () => {
    pdf.setFillColor(235, 244, 241);
    pdf.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
    pdf.setTextColor(53, 73, 67);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.text('PRODUCTO', margin + 4, y + 6.5);
    pdf.text('CANT.', 119, y + 6.5, { align: 'right' });
    pdf.text('PRECIO UNIT.', 153, y + 6.5, { align: 'right' });
    pdf.text('IMPORTE', pageWidth - margin - 4, y + 6.5, { align: 'right' });
    y += 13;
  };

  drawTableHeader();
  input.products.forEach((product) => {
    if (y > 251) {
      pdf.addPage();
      drawHeader();
      y = 55;
      drawTableHeader();
    }
    pdf.setTextColor(...dark);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    const productLines = pdf.splitTextToSize(product.name, 78) as string[];
    pdf.text(productLines, margin + 4, y + 4);
    pdf.setTextColor(...muted);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(`${product.totalHours.toFixed(2)} horas de impresion`, margin + 4, y + 10);
    pdf.setTextColor(...dark);
    pdf.setFontSize(8.5);
    pdf.text(String(product.quantity), 119, y + 5, { align: 'right' });
    pdf.text(formatCurrency(product.unitPrice, product.currency), 153, y + 5, {
      align: 'right',
    });
    pdf.setFont('helvetica', 'bold');
    pdf.text(
      formatCurrency(product.commercialPrice, product.currency),
      pageWidth - margin - 4,
      y + 5,
      { align: 'right' },
    );
    const rowHeight = Math.max(17, productLines.length * 4.2 + 10);
    pdf.setDrawColor(230, 232, 229);
    pdf.line(margin, y + rowHeight - 2, pageWidth - margin, y + rowHeight - 2);
    y += rowHeight;
  });

  const totals = input.products.reduce<Partial<Record<Currency, number>>>(
    (current, product) => ({
      ...current,
      [product.currency]:
        (current[product.currency] ?? 0) + product.commercialPrice,
    }),
    {},
  );
  const activeCurrencies = (['MXN', 'USD'] as const).filter(
    (currency) => totals[currency],
  );
  const totalsHeight = 18 + activeCurrencies.length * 10;
  if (y + totalsHeight > 265) {
    pdf.addPage();
    drawHeader();
    y = 58;
  }
  y += 5;
  pdf.setFillColor(247, 248, 245);
  pdf.roundedRect(105, y, pageWidth - margin - 105, totalsHeight, 2, 2, 'F');
  pdf.setTextColor(...muted);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('TOTAL DE LA COTIZACION', 110, y + 8);
  activeCurrencies.forEach((currency, index) => {
    pdf.setTextColor(...green);
    pdf.setFontSize(14);
    pdf.text(
      `${formatCurrency(totals[currency] ?? 0, currency)} ${currency}`,
      pageWidth - margin - 4,
      y + 18 + index * 10,
      { align: 'right' },
    );
  });

  y += totalsHeight + 13;
  if (y > 266) {
    pdf.addPage();
    drawHeader();
    y = 58;
  }
  pdf.setTextColor(...dark);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('NOTAS', margin, y);
  pdf.setTextColor(...muted);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.text(
    [
      'Esta cotizacion tiene una vigencia de 15 dias naturales.',
      'Los importes estan expresados en la moneda indicada. No incluyen envio salvo que se especifique.',
      'Los tiempos de entrega se confirman al aprobar la cotizacion.',
    ],
    margin,
    y + 6,
  );

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(226, 229, 225);
    pdf.line(margin, 281, pageWidth - margin, 281);
    pdf.setTextColor(132, 137, 132);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text('Horama 3D | Cotizacion generada digitalmente', margin, 287);
    pdf.text(`Pagina ${page} de ${pageCount}`, pageWidth - margin, 287, {
      align: 'right',
    });
  }

  return pdf.output('blob');
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudo cargar el logo de Horama 3D.');
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo preparar el logo.'));
    reader.readAsDataURL(blob);
  });
}

export async function downloadPrintingQuotePdf(
  input: PrintingQuotePdfInput,
): Promise<void> {
  const logoDataUrl = await imageUrlToDataUrl(
    `${import.meta.env.BASE_URL}horama-3d-logo-concept-v2.png`,
  );
  const blob = await createPrintingQuotePdf(input, logoDataUrl);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cotizacion-${input.quoteNumber.toLowerCase()}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
