// html2pdf.js não publica tipos próprios. Declaração mínima do encadeamento usado.
declare module "html2pdf.js" {
  interface Html2PdfWorker {
    from(element: HTMLElement | string): Html2PdfWorker;
    set(opt: Record<string, unknown>): Html2PdfWorker;
    save(): Promise<void>;
    outputPdf(type: "blob"): Promise<Blob>;
    outputPdf(type?: string): Promise<unknown>;
    toPdf(): Html2PdfWorker;
    then<T>(onfulfilled?: (value: unknown) => T): Promise<T>;
  }
  function html2pdf(): Html2PdfWorker;
  export default html2pdf;
}
