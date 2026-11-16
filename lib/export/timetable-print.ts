/** A4 landscape with 8 mm margins; the spare millimetre prevents rounding onto another page. */
export const TIMETABLE_PRINT_CSS = `
@page{size:A4 landscape;margin:8mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:9px}
.sheet{width:281mm;height:193mm;margin:0;padding:0;break-inside:avoid-page;page-break-inside:avoid;break-after:page;page-break-after:always}
.sheet:last-child{break-after:auto;page-break-after:auto}
.sheet-content{width:100%;display:flow-root;transform-origin:top left}
.head{display:flex;align-items:center;justify-content:center;gap:8px;text-align:center;border-bottom:1.5px solid #000;padding-bottom:4px;margin-bottom:4px;line-height:1.15}
.head img{width:10mm;height:10mm;object-fit:contain;flex-shrink:0}.head b{font-size:10px}.dept{font-size:12px;font-weight:700}
.title{text-align:center;margin-bottom:4px;line-height:1.15}.title .term{margin-top:1px}
.info{margin:0 auto 4px;border-collapse:collapse;line-height:1.15}.info td{padding:0 4px}.info .label,.info .k{width:95px}
table.grid,table.subjects{width:100%;border-collapse:collapse;table-layout:fixed}
.grid th,.grid td,.subjects th,.subjects td{border:.6px solid #000;text-align:center;padding:0 2px}
.grid .time-column{width:26mm}.grid th{height:17px;font-size:8px}.grid tbody tr{height:1px}
.grid td{font-size:8px;line-height:1.15;overflow-wrap:anywhere}.grid td.time{white-space:nowrap;font-size:7.5px;font-variant-numeric:tabular-nums}
.grid td.cls,.grid td.meeting{vertical-align:middle;line-height:1.15}
.subjects{margin:5px 0 0}.subjects th{background:#f3f4f6;font-size:8px}.subjects td{font-size:8px;padding:1px 3px;line-height:1.15;overflow-wrap:anywhere}
.subjects th:nth-child(1){width:12%}.subjects th:nth-child(2){width:45%}.subjects th:nth-child(3){width:7%}.subjects th:nth-child(4){width:36%}
thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
`;

/** Runs in the standalone print document, after images load and again when print layout starts. */
export const TIMETABLE_PRINT_SCRIPT = `<script>
(() => {
  function fit() {
    document.querySelectorAll('.sheet').forEach((page) => {
      const content = page.querySelector('.sheet-content');
      const grid = page.querySelector('table.grid');
      if (!content || !grid) return;
      const height = page.clientHeight - 4;
      function layout(scale) {
        content.style.zoom = String(scale);
        // Keep the full page width even when a dense sheet needs smaller text.
        content.style.width = (page.clientWidth / scale) + 'px';
        grid.style.height = '';
        const otherHeight = content.getBoundingClientRect().height - grid.getBoundingClientRect().height;
        grid.style.height = Math.max(0, (height - otherHeight) / scale) + 'px';
        return content.getBoundingClientRect().height <= height + 0.5 && content.scrollWidth * scale <= page.clientWidth + 0.5;
      }
      // Measure actual browser layout: table cell wrapping and font rounding are not proportional.
      if (!layout(1)) {
        let low = 0, high = 1;
        for (let i = 0; i < 12; i++) {
          const scale = (low + high) / 2;
          if (layout(scale)) low = scale;
          else high = scale;
        }
        layout(Math.max(low, 1 / 4096) * 0.995);
      }
    });
  }
  window.addEventListener('load', fit);
  window.addEventListener('beforeprint', fit);
  fit();
})();
</script>`;

/** Explicit column sizing prevents the time range from taking an equal share of the day columns. */
export function timetablePrintColumns(dayCount: number) {
  return `<colgroup><col class="time-column">${"<col>".repeat(dayCount)}</colgroup>`;
}
