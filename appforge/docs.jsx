// AI Document Generation
// ----------------------
// The model emits document specs as a special fenced block:
//
//   ```forge-doc filename="report.pdf" format="pdf"
//   { "title": "Q3 Report", "blocks": [...] }
//   ```
//
// We parse those blocks out of the streamed message, then turn each spec into
// a real downloadable file using browser-native client-side libraries (jsPDF,
// docx, pptxgenjs, SheetJS). All generators are lazy-loaded so the docs
// libraries are only fetched when a document is actually built.

const SUPPORTED = new Set([
  'pdf', 'docx', 'pptx', 'xlsx', 'csv', 'md', 'markdown', 'txt', 'json',
]);

const MIME_FOR = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv:  'text/csv',
  md:   'text/markdown',
  markdown: 'text/markdown',
  txt:  'text/plain',
  json: 'application/json',
};

export const FRIENDLY_FORMAT = {
  pdf: 'PDF',
  docx: 'Word',
  pptx: 'PowerPoint',
  xlsx: 'Excel',
  csv: 'CSV',
  md: 'Markdown',
  markdown: 'Markdown',
  txt: 'Text',
  json: 'JSON',
};

// Parse `forge-doc` fenced blocks. Tolerates filename / format attributes in
// any order and also accepts a top-level `format` field inside the JSON spec.
export function extractDocs(text) {
  if (!text) return [];
  const out = [];
  const re = /```forge-doc([^\n]*)\n([\s\S]*?)(```|$)/g;
  let m;
  let idx = 0;
  while ((m = re.exec(text))) {
    const headers = m[1] || '';
    const body = m[2] || '';
    const closed = m[3] === '```';
    if (!closed) continue;

    const filenameMatch = headers.match(/filename\s*=\s*["']([^"']+)["']/i);
    const formatMatch = headers.match(/format\s*=\s*["']([^"']+)["']/i);

    let spec = null;
    try { spec = JSON.parse(body); } catch { spec = null; }
    if (!spec) continue;

    const filename = (filenameMatch?.[1] || spec.filename || `document-${idx + 1}`).trim();
    let format = (formatMatch?.[1] || spec.format || filename.split('.').pop() || '').toLowerCase();
    if (!SUPPORTED.has(format)) {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext && SUPPORTED.has(ext)) format = ext;
    }
    if (!SUPPORTED.has(format)) continue;

    out.push({
      id: `doc_${hashStr(filename + format + body.length)}_${idx}`,
      filename: ensureExtension(filename, format),
      format,
      spec,
      raw: body,
      generatedAt: Date.now(),
    });
    idx++;
  }
  return out;
}

function ensureExtension(name, format) {
  const ext = format === 'markdown' ? 'md' : format;
  if (name.toLowerCase().endsWith('.' + ext)) return name;
  // strip any existing extension that doesn't match
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

// ---------- Format generators ---------------------------------------------

async function generatePdf(spec) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableMod.default || autoTableMod.autoTable || autoTableMod;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;
  const primary = spec.theme?.primary || '#7c3aed';
  const accent = spec.theme?.accent || '#f472b6';
  const text = spec.theme?.text || '#0f0f17';
  let y = margin;

  const ensureRoom = (need) => {
    if (y + need > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const drawCover = (block) => {
    doc.setFillColor(primary);
    doc.rect(0, 0, pageW, pageH * 0.45, 'F');
    doc.setFillColor(accent);
    doc.rect(0, pageH * 0.45, pageW, 6, 'F');
    doc.setTextColor('#ffffff');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(34);
    doc.text(block.title || spec.title || 'Untitled', margin, pageH * 0.25, { maxWidth: pageW - margin * 2 });
    if (block.subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(15);
      doc.text(block.subtitle, margin, pageH * 0.32, { maxWidth: pageW - margin * 2 });
    }
    if (spec.author) {
      doc.setFontSize(11);
      doc.text(spec.author, margin, pageH * 0.4);
    }
    doc.setTextColor(text);
    doc.addPage();
    y = margin;
  };

  const drawHeading = (block) => {
    const level = Math.max(1, Math.min(3, block.level || 1));
    const sizes = { 1: 22, 2: 17, 3: 14 };
    ensureRoom(sizes[level] + 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(sizes[level]);
    doc.setTextColor(level === 1 ? primary : text);
    doc.text(String(block.text || ''), margin, y, { maxWidth: pageW - margin * 2 });
    y += sizes[level] + 8;
    if (level === 1) {
      doc.setDrawColor(primary);
      doc.setLineWidth(1.5);
      doc.line(margin, y, margin + 48, y);
      y += 12;
    }
    doc.setTextColor(text);
  };

  const drawParagraph = (block) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(text);
    const lines = doc.splitTextToSize(String(block.text || ''), pageW - margin * 2);
    for (const line of lines) {
      ensureRoom(16);
      doc.text(line, margin, y);
      y += 15;
    }
    y += 6;
  };

  const drawList = (block) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const items = Array.isArray(block.items) ? block.items : [];
    items.forEach((item, i) => {
      const bullet = block.ordered ? `${i + 1}.` : '•';
      const lines = doc.splitTextToSize(String(item), pageW - margin * 2 - 18);
      ensureRoom(lines.length * 15 + 4);
      doc.setTextColor(primary);
      doc.text(bullet, margin, y);
      doc.setTextColor(text);
      lines.forEach((line, j) => {
        doc.text(line, margin + 18, y + j * 15);
      });
      y += lines.length * 15 + 2;
    });
    y += 6;
  };

  const drawTable = (block) => {
    const headers = Array.isArray(block.headers) ? block.headers : [];
    const rows = Array.isArray(block.rows) ? block.rows : [];
    autoTable(doc, {
      startY: y,
      head: headers.length ? [headers] : undefined,
      body: rows,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, textColor: text, lineColor: '#e5e7eb' },
      headStyles: { fillColor: primary, textColor: '#ffffff', fontStyle: 'bold' },
      alternateRowStyles: { fillColor: '#f8fafc' },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 14;
  };

  const drawKpi = (block) => {
    const items = Array.isArray(block.items) ? block.items : [];
    if (!items.length) return;
    const cols = Math.min(items.length, 4);
    const cardW = (pageW - margin * 2 - (cols - 1) * 10) / cols;
    const cardH = 64;
    ensureRoom(cardH + 14);
    items.forEach((it, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      if (col === 0 && row > 0) {
        y += cardH + 10;
        ensureRoom(cardH + 14);
      }
      const x = margin + col * (cardW + 10);
      const cy = y + row * 0;
      doc.setFillColor('#f5f3ff');
      doc.roundedRect(x, cy, cardW, cardH, 8, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(primary);
      doc.text(String(it.value ?? ''), x + 12, cy + 30, { maxWidth: cardW - 24 });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor('#6b7280');
      doc.text(String(it.label ?? ''), x + 12, cy + 48, { maxWidth: cardW - 24 });
      if (it.delta) {
        doc.setTextColor(String(it.delta).startsWith('-') ? '#dc2626' : '#16a34a');
        doc.text(String(it.delta), x + cardW - 12 - doc.getTextWidth(String(it.delta)), cy + 18);
      }
    });
    y += cardH + 14;
    doc.setTextColor(text);
  };

  const drawDivider = () => {
    ensureRoom(20);
    doc.setDrawColor('#e5e7eb');
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
  };

  const blocks = Array.isArray(spec.blocks) ? spec.blocks : [
    { type: 'heading', level: 1, text: spec.title || 'Untitled' },
    ...(spec.body ? [{ type: 'paragraph', text: String(spec.body) }] : []),
  ];

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    switch (block.type) {
      case 'cover':      drawCover(block); break;
      case 'heading':    drawHeading(block); break;
      case 'paragraph':  drawParagraph(block); break;
      case 'list':       drawList(block); break;
      case 'table':      drawTable(block); break;
      case 'kpi':        drawKpi(block); break;
      case 'divider':    drawDivider(); break;
      case 'page-break': doc.addPage(); y = margin; break;
      default:
        if (block.text) drawParagraph(block);
    }
  }

  // Page numbers
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor('#9ca3af');
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 24, { align: 'right' });
    if (spec.title && i > 1) {
      doc.text(String(spec.title), margin, pageH - 24);
    }
  }

  return doc.output('blob');
}

async function generateDocx(spec) {
  const docxMod = await import('docx');
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    Table, TableRow, TableCell, BorderStyle, WidthType, PageBreak,
  } = docxMod;

  const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];
  const children = [];

  const heading = (text, level) => new Paragraph({
    text: String(text || ''),
    heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][Math.max(0, Math.min(2, (level || 1) - 1))],
  });

  const para = (text, opts = {}) => new Paragraph({
    children: [new TextRun({ text: String(text || ''), ...opts })],
    spacing: { after: 160 },
  });

  for (const block of blocks) {
    if (!block) continue;
    switch (block.type) {
      case 'cover':
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 1600, after: 240 },
          children: [new TextRun({ text: String(block.title || spec.title || 'Untitled'), bold: true, size: 64 })],
        }));
        if (block.subtitle) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 480 },
            children: [new TextRun({ text: String(block.subtitle), size: 28, color: '6b7280' })],
          }));
        }
        if (spec.author) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: spec.author, italics: true, size: 22 })],
          }));
        }
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case 'heading':
        children.push(heading(block.text, block.level));
        break;
      case 'paragraph':
        children.push(para(block.text));
        break;
      case 'list': {
        const items = Array.isArray(block.items) ? block.items : [];
        items.forEach((it, i) => {
          children.push(new Paragraph({
            text: `${block.ordered ? `${i + 1}. ` : '• '}${String(it)}`,
            spacing: { after: 80 },
            indent: { left: 360 },
          }));
        });
        break;
      }
      case 'kpi': {
        const items = Array.isArray(block.items) ? block.items : [];
        if (!items.length) break;
        const row = new TableRow({
          children: items.map(it => new TableCell({
            width: { size: Math.floor(9000 / items.length), type: WidthType.DXA },
            children: [
              new Paragraph({ children: [new TextRun({ text: String(it.value ?? ''), bold: true, size: 32, color: '7c3aed' })] }),
              new Paragraph({ children: [new TextRun({ text: String(it.label ?? ''), size: 18, color: '6b7280' })] }),
            ],
          })),
        });
        children.push(new Table({ rows: [row], width: { size: 9000, type: WidthType.DXA } }));
        children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
        break;
      }
      case 'table': {
        const headers = Array.isArray(block.headers) ? block.headers : [];
        const rows = Array.isArray(block.rows) ? block.rows : [];
        const tableRows = [];
        if (headers.length) {
          tableRows.push(new TableRow({
            tableHeader: true,
            children: headers.map(h => new TableCell({
              shading: { fill: '7c3aed' },
              children: [new Paragraph({ children: [new TextRun({ text: String(h), bold: true, color: 'ffffff' })] })],
            })),
          }));
        }
        for (const r of rows) {
          tableRows.push(new TableRow({
            children: (Array.isArray(r) ? r : []).map(c => new TableCell({
              children: [new Paragraph({ text: String(c ?? '') })],
            })),
          }));
        }
        if (tableRows.length) {
          children.push(new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }));
          children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
        }
        break;
      }
      case 'divider':
        children.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'd1d5db' } },
          spacing: { after: 200 },
        }));
        break;
      case 'page-break':
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      default:
        if (block.text) children.push(para(block.text));
    }
  }

  if (!children.length) {
    children.push(heading(spec.title || 'Untitled', 1));
    if (spec.body) children.push(para(spec.body));
  }

  const doc = new Document({
    creator: spec.author || "Vishal's Lovable",
    title: spec.title || 'Document',
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}

async function generatePptx(spec) {
  const PptxMod = await import('pptxgenjs');
  const Pptx = PptxMod.default || PptxMod;
  const pres = new Pptx();
  pres.layout = 'LAYOUT_WIDE';

  const primary = spec.theme?.primary || '7c3aed';
  const background = spec.theme?.background || 'F8FAFC';
  const text = spec.theme?.text || '0F0F17';
  const accent = spec.theme?.accent || 'F472B6';
  const stripHash = (c) => String(c || '').replace('#', '');

  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  if (!slides.length && spec.blocks) {
    // Fallback — fold blocks into slides at headings/page-breaks
    let cur = { layout: 'bullets', title: spec.title || 'Untitled', items: [] };
    for (const b of spec.blocks) {
      if (b.type === 'heading' && b.level === 1) {
        if (cur.items?.length || cur.title) slides.push(cur);
        cur = { layout: 'bullets', title: String(b.text || ''), items: [] };
      } else if (b.type === 'paragraph') {
        cur.items = cur.items || [];
        cur.items.push(String(b.text || ''));
      } else if (b.type === 'list') {
        cur.items = (cur.items || []).concat((b.items || []).map(String));
      } else if (b.type === 'page-break') {
        slides.push(cur);
        cur = { layout: 'bullets', title: '', items: [] };
      }
    }
    slides.push(cur);
  }

  for (const sl of slides) {
    const slide = pres.addSlide();
    slide.background = { color: stripHash(background) };

    // Top accent bar on every slide for brand consistency
    slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.16, fill: { color: stripHash(primary) } });

    if (sl.layout === 'title') {
      slide.addText(String(sl.title || ''), {
        x: 0.6, y: 2.4, w: '88%', h: 1.5,
        fontSize: 48, bold: true, color: stripHash(primary), fontFace: 'Calibri',
      });
      if (sl.subtitle) {
        slide.addText(String(sl.subtitle), {
          x: 0.6, y: 3.9, w: '88%', h: 1, fontSize: 22, color: stripHash(text), fontFace: 'Calibri',
        });
      }
    } else if (sl.layout === 'section') {
      slide.background = { color: stripHash(primary) };
      slide.addText(String(sl.title || ''), {
        x: 0.6, y: 2.6, w: '88%', h: 2,
        fontSize: 44, bold: true, color: 'FFFFFF', fontFace: 'Calibri',
      });
      if (sl.body) {
        slide.addText(String(sl.body), {
          x: 0.6, y: 4.2, w: '88%', h: 1, fontSize: 18, color: 'F8FAFC', fontFace: 'Calibri',
        });
      }
    } else if (sl.layout === 'kpi') {
      slide.addText(String(sl.title || ''), {
        x: 0.6, y: 0.5, w: '88%', h: 0.7, fontSize: 28, bold: true, color: stripHash(primary),
      });
      const items = Array.isArray(sl.items) ? sl.items : [];
      const cols = Math.min(items.length, 4) || 1;
      const colW = (12.4 - (cols - 1) * 0.3) / cols;
      items.forEach((it, i) => {
        const x = 0.6 + (i % cols) * (colW + 0.3);
        const y = 1.6 + Math.floor(i / cols) * 2.2;
        slide.addShape('roundRect', { x, y, w: colW, h: 1.9, fill: { color: 'FFFFFF' }, line: { color: 'E5E7EB', width: 0.5 }, rectRadius: 0.1 });
        slide.addText(String(it.value ?? ''), { x: x + 0.2, y: y + 0.25, w: colW - 0.4, h: 0.8, fontSize: 32, bold: true, color: stripHash(primary) });
        slide.addText(String(it.label ?? ''), { x: x + 0.2, y: y + 1.1, w: colW - 0.4, h: 0.4, fontSize: 14, color: '6B7280' });
        if (it.delta) {
          slide.addText(String(it.delta), { x: x + 0.2, y: y + 1.5, w: colW - 0.4, h: 0.4, fontSize: 12, color: String(it.delta).startsWith('-') ? 'DC2626' : '16A34A' });
        }
      });
    } else if (sl.layout === 'table') {
      slide.addText(String(sl.title || ''), {
        x: 0.6, y: 0.5, w: '88%', h: 0.7, fontSize: 28, bold: true, color: stripHash(primary),
      });
      const headers = (sl.headers || []).map(h => ({ text: String(h), options: { bold: true, color: 'FFFFFF', fill: { color: stripHash(primary) } } }));
      const body = (sl.rows || []).map(r => (Array.isArray(r) ? r : []).map(c => String(c ?? '')));
      const data = [headers, ...body];
      slide.addTable(data, {
        x: 0.6, y: 1.5, w: 12.4, fontSize: 14, color: stripHash(text), border: { type: 'solid', color: 'E5E7EB', pt: 0.5 },
      });
    } else {
      // bullets / default
      slide.addText(String(sl.title || ''), {
        x: 0.6, y: 0.5, w: '88%', h: 0.8, fontSize: 32, bold: true, color: stripHash(primary), fontFace: 'Calibri',
      });
      const items = Array.isArray(sl.items) ? sl.items : (sl.body ? [String(sl.body)] : []);
      if (items.length) {
        slide.addText(items.map(t => ({ text: String(t), options: { bullet: { type: 'bullet' } } })), {
          x: 0.6, y: 1.6, w: '88%', h: 5.4, fontSize: 18, color: stripHash(text), fontFace: 'Calibri', paraSpaceAfter: 8,
        });
      }
    }

    // Footer accent
    slide.addShape('rect', { x: 0, y: 7.34, w: '100%', h: 0.06, fill: { color: stripHash(accent) } });
  }

  const blob = await pres.write({ outputType: 'blob' });
  return blob;
}

async function generateXlsx(spec) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const sheets = Array.isArray(spec.sheets) && spec.sheets.length
    ? spec.sheets
    : [{ name: 'Sheet1', headers: spec.headers || [], rows: spec.rows || [] }];

  sheets.forEach((s, i) => {
    const headers = Array.isArray(s.headers) ? s.headers : [];
    const rows = Array.isArray(s.rows) ? s.rows : [];
    const aoa = headers.length ? [headers, ...rows] : rows;
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (headers.length) {
      ws['!cols'] = headers.map((h) => ({ wch: Math.min(40, Math.max(10, String(h).length + 4)) }));
    }
    XLSX.utils.book_append_sheet(wb, ws, (s.name || `Sheet${i + 1}`).slice(0, 31));
  });

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: MIME_FOR.xlsx });
}

function generateCsv(spec) {
  const sheets = Array.isArray(spec.sheets) ? spec.sheets : [{ headers: spec.headers, rows: spec.rows }];
  const sheet = sheets[0] || {};
  const headers = Array.isArray(sheet.headers) ? sheet.headers : [];
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const data = headers.length ? [headers, ...rows] : rows;
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const text = data.map(r => (Array.isArray(r) ? r : [r]).map(escape).join(',')).join('\n');
  return new Blob([text], { type: MIME_FOR.csv });
}

// Render a structured spec to plain markdown
function specToMarkdown(spec) {
  if (typeof spec === 'string') return spec;
  if (typeof spec.markdown === 'string') return spec.markdown;
  if (typeof spec.content === 'string') return spec.content;
  const lines = [];
  if (spec.title) lines.push(`# ${spec.title}`, '');
  if (spec.author) lines.push(`*by ${spec.author}*`, '');
  const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];
  for (const b of blocks) {
    if (!b) continue;
    switch (b.type) {
      case 'cover':
        lines.push(`# ${b.title || spec.title || ''}`);
        if (b.subtitle) lines.push(`> ${b.subtitle}`);
        lines.push('');
        break;
      case 'heading':
        lines.push(`${'#'.repeat(Math.max(1, Math.min(6, b.level || 1)))} ${b.text || ''}`, '');
        break;
      case 'paragraph':
        lines.push(String(b.text || ''), '');
        break;
      case 'list': {
        const items = Array.isArray(b.items) ? b.items : [];
        items.forEach((it, i) => lines.push(`${b.ordered ? `${i + 1}.` : '-'} ${String(it)}`));
        lines.push('');
        break;
      }
      case 'table': {
        const headers = Array.isArray(b.headers) ? b.headers : [];
        const rows = Array.isArray(b.rows) ? b.rows : [];
        if (headers.length) {
          lines.push('| ' + headers.join(' | ') + ' |');
          lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');
        }
        rows.forEach(r => lines.push('| ' + (Array.isArray(r) ? r : []).map(c => String(c ?? '')).join(' | ') + ' |'));
        lines.push('');
        break;
      }
      case 'kpi': {
        const items = Array.isArray(b.items) ? b.items : [];
        items.forEach(it => lines.push(`- **${it.label || ''}**: ${it.value || ''}${it.delta ? ` (${it.delta})` : ''}`));
        lines.push('');
        break;
      }
      case 'divider':    lines.push('---', ''); break;
      case 'page-break': lines.push('', '---', ''); break;
      default:
        if (b.text) lines.push(String(b.text), '');
    }
  }
  return lines.join('\n');
}

function generateMarkdown(spec) {
  return new Blob([specToMarkdown(spec)], { type: MIME_FOR.md });
}

function generateText(spec) {
  const md = specToMarkdown(spec);
  // Remove markdown sigils
  const text = md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\|/g, ' ');
  return new Blob([text], { type: MIME_FOR.txt });
}

function generateJson(spec) {
  return new Blob([JSON.stringify(spec, null, 2)], { type: MIME_FOR.json });
}

// ---------- Public API ----------------------------------------------------

export async function buildBlob(doc) {
  const fmt = doc.format;
  switch (fmt) {
    case 'pdf':       return generatePdf(doc.spec);
    case 'docx':      return generateDocx(doc.spec);
    case 'pptx':      return generatePptx(doc.spec);
    case 'xlsx':      return generateXlsx(doc.spec);
    case 'csv':       return generateCsv(doc.spec);
    case 'md':
    case 'markdown':  return generateMarkdown(doc.spec);
    case 'txt':       return generateText(doc.spec);
    case 'json':      return generateJson(doc.spec);
    default:
      throw new Error(`Unsupported document format: ${fmt}`);
  }
}

export async function materializeDocs(docs) {
  const out = [];
  for (const d of docs || []) {
    try {
      const blob = await buildBlob(d);
      out.push({ ...d, blob, size: blob.size, url: URL.createObjectURL(blob), error: null });
    } catch (err) {
      out.push({ ...d, blob: null, size: 0, url: null, error: err?.message || String(err) });
    }
  }
  return out;
}

export function downloadDoc(doc) {
  if (!doc?.url) return;
  const a = document.createElement('a');
  a.href = doc.url;
  a.download = doc.filename || `document.${doc.format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

// Diff two doc lists and merge — preserves stable identity (id) so existing
// blob URLs survive subsequent stream chunks instead of being recreated.
export function mergeDocs(existing, incoming) {
  const out = [];
  for (const d of incoming || []) {
    const prev = (existing || []).find(p => p.id === d.id);
    out.push(prev ? { ...prev, ...d, blob: prev.blob, url: prev.url, size: prev.size } : d);
  }
  return out;
}
