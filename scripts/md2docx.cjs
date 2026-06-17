/**
 * md2docx.cjs — basit Markdown → DOCX dönüştürücü (docx-js).
 * Başlık (#/##/###), kalın (**...**), madde/numara listesi, tablo, kod bloğu,
 * yatay çizgi ve paragrafları destekler. Türkçe karakterler (Arial) korunur.
 *
 * Kullanım: NODE_PATH=$(npm root -g) node scripts/md2docx.cjs <in.md> <out.docx> ["Başlık"]
 */
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LevelFormat,
} = require('docx');

const [, , inPath, outPath, docTitle] = process.argv;
const md = fs.readFileSync(inPath, 'utf8').replace(/\r\n/g, '\n');
const lines = md.split('\n');

const CONTENT_W = 9360; // US Letter, 1" margins

// **bold** → TextRun[]
function inlineRuns(text) {
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((p) => p !== '');
  for (const p of parts) {
    if (/^\*\*[^*]+\*\*$/.test(p)) runs.push(new TextRun({ text: p.slice(2, -2), bold: true }));
    else if (/^`[^`]+`$/.test(p)) runs.push(new TextRun({ text: p.slice(1, -1), font: 'Consolas' }));
    else runs.push(new TextRun(p));
  }
  return runs.length ? runs : [new TextRun(text)];
}

function tableFrom(rows) {
  // rows: array of cell-arrays (header first, separator already removed)
  const cols = Math.max(...rows.map((r) => r.length));
  const colW = Math.floor(CONTENT_W / cols);
  const widths = Array(cols).fill(colW);
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const trows = rows.map((cells, ri) => new TableRow({
    children: Array.from({ length: cols }).map((_, ci) => new TableCell({
      borders,
      width: { size: widths[ci], type: WidthType.DXA },
      shading: ri === 0 ? { fill: 'D9E2F3', type: ShadingType.CLEAR } : undefined,
      margins: { top: 60, bottom: 60, left: 110, right: 110 },
      children: [new Paragraph({ children: inlineRuns((cells[ci] || '').trim()) })],
    })),
  }));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, rows: trows });
}

const children = [];
if (docTitle) {
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: docTitle, bold: true })] }));
}

let i = 0;
while (i < lines.length) {
  let line = lines[i];
  const t = line.trim();

  if (t === '') { i++; continue; }

  // Kod bloğu
  if (t.startsWith('```')) {
    i++;
    const code = [];
    while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(lines[i]); i++; }
    i++; // closing fence
    for (const c of code) {
      children.push(new Paragraph({ shading: { fill: 'F2F2F2', type: ShadingType.CLEAR }, children: [new TextRun({ text: c || ' ', font: 'Consolas', size: 18 })] }));
    }
    continue;
  }

  // Tablo
  if (t.startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim()) && lines[i + 1].includes('-')) {
    const rows = [];
    const parseRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
    rows.push(parseRow(line));
    i += 2; // skip header + separator
    while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(parseRow(lines[i])); i++; }
    children.push(tableFrom(rows));
    children.push(new Paragraph({ children: [new TextRun('')] }));
    continue;
  }

  // Başlık
  const h = t.match(/^(#{1,4})\s+(.*)$/);
  if (h) {
    const lvl = h[1].length;
    const map = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 };
    children.push(new Paragraph({ heading: map[lvl], children: inlineRuns(h[2]) }));
    i++; continue;
  }

  // Yatay çizgi
  if (/^(---+|\*\*\*+|___+)$/.test(t)) {
    children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E75B6', space: 1 } }, children: [new TextRun('')] }));
    i++; continue;
  }

  // Madde listesi
  const bullet = t.match(/^[-*]\s+(.*)$/);
  if (bullet) {
    children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: inlineRuns(bullet[1]) }));
    i++; continue;
  }
  // Numara listesi
  const num = t.match(/^\d+\.\s+(.*)$/);
  if (num) {
    children.push(new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: inlineRuns(num[1]) }));
    i++; continue;
  }

  // Normal paragraf
  children.push(new Paragraph({ children: inlineRuns(t) }));
  i++;
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 40, bold: true, font: 'Arial' }, paragraph: { spacing: { after: 300 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, font: 'Arial', color: '1F3864' }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, font: 'Arial', color: '2E5496' }, paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 23, bold: true, font: 'Arial', color: '2E5496' }, paragraph: { spacing: { before: 160, after: 100 }, outlineLevel: 2 } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, italics: true, font: 'Arial' }, paragraph: { spacing: { before: 120, after: 80 }, outlineLevel: 3 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 600, hanging: 300 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 600, hanging: 300 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(outPath, buf); console.log('OK ->', outPath, buf.length, 'bytes'); });
