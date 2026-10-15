// ===== PDF wyświetlany prosto na stronie notatki =====
// Biblioteka pdf.js ładuje się dopiero, gdy w notatce jest PDF. Strony rysują się, gdy do nich dojedziesz.
// Na obrazie strony leży przezroczysta warstwa tekstu, dzięki której tekst da się zaznaczać i kopiować.
import 'pdfjs-dist/legacy/web/pdf_viewer.css';

let libPromise;
const loadLib = () => (libPromise ??= (async () => {
  const [pdf, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdf.GlobalWorkerOptions.workerSrc = worker.default;
  return pdf;
})());

export async function renderPdf(container, blob) {
  try {
    const pdfjs = await loadLib();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const width = container.clientWidth || 600;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const first = (await doc.getPage(1)).getViewport({ scale: 1 });

    const draw = async (box) => {
      const page = await doc.getPage(Number(box.dataset.n));
      const scale = width / page.getViewport({ scale: 1 }).width;
      const vp = page.getViewport({ scale: scale * dpr });

      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

      const inner = document.createElement('div');
      inner.className = 'pdf-inner';
      inner.style.setProperty('--scale-factor', String(scale));
      const textDiv = document.createElement('div');
      textDiv.className = 'textLayer';
      inner.append(canvas, textDiv);
      box.style.aspectRatio = '';
      box.replaceChildren(inner);

      await new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textDiv,
        viewport: page.getViewport({ scale }),
      }).render();
    };

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); draw(e.target).catch((err) => { console.error('PDF strona:', err); }); }
    }, { rootMargin: '900px' });

    container.replaceChildren();
    for (let i = 1; i <= doc.numPages; i++) {
      const box = document.createElement('div');
      box.className = 'pdf-page';
      box.dataset.n = i;
      box.style.aspectRatio = `${first.width} / ${first.height}`;
      container.append(box);
      io.observe(box);
    }
  } catch (err) {
    console.error('PDF:', err);
    const why = err?.name === 'PasswordException' ? 'plik jest chroniony hasłem' : (err?.message || 'nieznany błąd');
    container.textContent = `Nie udało się otworzyć tego PDF-a (${why}). Możesz go pobrać przyciskiem ⬇ powyżej.`;
  }
}
