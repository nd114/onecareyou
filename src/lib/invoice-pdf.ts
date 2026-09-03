import jsPDF from "jspdf";
import { format } from "date-fns";
import { balanceMinor, formatMoney, toMinor, type InvoiceRow } from "@/lib/fhir/invoice";

/**
 * An invoice as a document the patient keeps.
 *
 * A bill that exists only as a row in someone else's system is a notification,
 * not a record. This renders the same data as a page the patient can save to
 * their Vault, download, print, or hand to an insurer — and once it is in the
 * Vault it survives the share ending, the practice leaving, or the account
 * being closed.
 *
 * Deliberately plain. This is a financial document, and a receipt that tries to
 * look like marketing is a receipt nobody trusts.
 */
export function renderInvoicePdf(
  invoice: InvoiceRow,
  practiceName?: string | null,
): jsPDF {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 56;
  const right = pageWidth - margin;
  let y = margin;

  const line = (text: string, size = 10, bold = false, align: "left" | "right" = "left") => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.text(text, align === "right" ? right : margin, y, { align });
  };

  const nextPageIfNeeded = (needed = 20) => {
    if (y + needed > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  line("INVOICE", 18, true);
  y += 22;
  line(invoice.invoice_number, 11, true);
  y += 16;
  if (practiceName) { line(practiceName, 10); y += 14; }
  if (invoice.issued_at) {
    line(`Issued ${format(new Date(invoice.issued_at), "d MMMM yyyy")}`, 10);
    y += 14;
  }
  if (invoice.due_at) {
    line(`Due ${format(new Date(invoice.due_at), "d MMMM yyyy")}`, 10);
    y += 14;
  }

  y += 10;
  pdf.setDrawColor(200);
  pdf.line(margin, y, right, y);
  y += 20;

  line("Description", 9, true);
  line("Amount", 9, true, "right");
  y += 16;

  const items = invoice.items ?? [];
  if (items.length === 0) {
    line("—", 10);
    y += 16;
  } else {
    for (const item of items) {
      nextPageIfNeeded();
      const qty = Number(item.quantity);
      const label = qty !== 1 ? `${item.description} × ${qty}` : item.description;
      // Truncated rather than overlapping the amount: a number a reader cannot
      // trust to be whole is worse than a description they can tell is clipped.
      line(label.length > 60 ? `${label.slice(0, 57)}…` : label, 10);
      line(formatMoney(item.amount_minor, invoice.currency), 10, false, "right");
      y += 16;
    }
  }

  y += 6;
  pdf.line(margin, y, right, y);
  y += 20;

  line("Total", 11, true);
  line(formatMoney(invoice.total_minor, invoice.currency), 11, true, "right");
  y += 18;

  if (toMinor(invoice.paid_minor) > 0) {
    line("Paid", 10);
    line(formatMoney(invoice.paid_minor, invoice.currency), 10, false, "right");
    y += 16;
    line("Outstanding", 11, true);
    line(formatMoney(balanceMinor(invoice), invoice.currency), 11, true, "right");
    y += 18;
  }

  if (invoice.status === "balanced") {
    y += 6;
    line("PAID IN FULL", 12, true);
    y += 18;
  } else if (invoice.status === "cancelled" || invoice.status === "entered-in-error") {
    y += 6;
    line("CANCELLED — NOTHING IS OWED ON THIS INVOICE", 11, true);
    y += 18;
  }

  if (invoice.note) {
    y += 10;
    nextPageIfNeeded(30);
    line("Note", 9, true);
    y += 14;
    for (const chunk of pdf.splitTextToSize(invoice.note, right - margin) as string[]) {
      nextPageIfNeeded();
      line(chunk, 10);
      y += 14;
    }
  }

  return pdf;
}

/** The invoice as a File, for saving into the Vault. */
export function invoicePdfFile(invoice: InvoiceRow, practiceName?: string | null): File {
  const blob = renderInvoicePdf(invoice, practiceName).output("blob");
  return new File([blob], `${invoice.invoice_number}.pdf`, { type: "application/pdf" });
}

/** The invoice as a download, for a patient who just wants it on their device. */
export function downloadInvoicePdf(invoice: InvoiceRow, practiceName?: string | null): void {
  renderInvoicePdf(invoice, practiceName).save(`${invoice.invoice_number}.pdf`);
}
