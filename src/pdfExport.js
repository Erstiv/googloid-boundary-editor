import jsPDF from 'jspdf';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 45;
const CONTENT_W = PAGE_W - MARGIN * 2;

const formatCurrency = (val) => {
  if (val === undefined || val === null) return '$0';
  return '$' + Math.round(val).toLocaleString();
};

const USE_CODE_DESCRIPTIONS = {
  "101": "Single Family Residential", "102": "Condo", "104": "Two Family",
  "109": "Multiple Houses", "130": "Vacant Land", "131": "Vacant Land", "132": "Vacant Land",
  "314": "Restaurant/Bar", "316": "Mixed Use", "325": "Motel", "334": "Gas Station",
  "337": "Parking Lot", "340": "General Office", "391": "Vacant Commercial",
  "392": "Vacant Commercial", "013": "Multiple Use", "915": "Gov/Institutional",
  "929": "Gov/Institutional", "930": "Gov/Institutional", "950": "Gov/Institutional",
  "960": "Gov/Institutional", "970": "Gov/Institutional", "971": "Gov/Institutional"
};

function getFieldValue(parcel, key) {
  switch (key) {
    case 'address': return parcel.address || parcel.addr || '';
    case 'street': return parcel.street || '';
    case 'owner': return parcel.owner || '';
    case 'total_val': return formatCurrency(parcel.total_val || parcel.totalVal);
    case 'bldg_val': return formatCurrency(parcel.bldg_val || parcel.bldgVal);
    case 'land_val': return formatCurrency(parcel.land_val || parcel.landVal);
    case 'lot_size': return (parcel.lot_size || parcel.acres || 0).toFixed(2);
    case 'use_code': {
      const code = parcel.use_code || parcel.useCode || '';
      const desc = USE_CODE_DESCRIPTIONS[code];
      return desc ? `${code} (${desc})` : code;
    }
    case 'centroid_lat': return (parcel.centroid_lat || 0).toFixed(6);
    case 'centroid_lon': return (parcel.centroid_lon || 0).toFixed(6);
    default: return '';
  }
}

function getFieldLabel(key, allFields) {
  const f = allFields.find(x => x.key === key);
  return f ? f.label : key;
}

/**
 * Draw boundary and parcels directly on the PDF using coordinate math.
 * No html2canvas dependency — always accurate.
 */
function drawMapOnPDF(pdf, boundary, insideParcels, x, y, w, h) {
  if (!boundary || boundary.length < 3) return;

  // Find bounds
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  boundary.forEach(([lon, lat]) => {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });

  // 10% padding
  const padLon = (maxLon - minLon) * 0.1;
  const padLat = (maxLat - minLat) * 0.1;
  minLon -= padLon; maxLon += padLon;
  minLat -= padLat; maxLat += padLat;

  const lonRange = maxLon - minLon;
  const latRange = maxLat - minLat;

  const toX = (lon) => x + ((lon - minLon) / lonRange) * w;
  const toY = (lat) => y + h - ((lat - minLat) / latRange) * h;

  // Background
  pdf.setFillColor(240, 244, 248);
  pdf.rect(x, y, w, h, 'F');

  // Parcel dots
  const USE_CODE_PDF_COLORS = {
    '1': [59, 130, 246],
    '3': [245, 158, 11],
    '4': [139, 92, 246],
    '9': [16, 185, 129],
    '8': [16, 185, 129],
  };

  insideParcels.forEach(p => {
    const lon = p.centroid_lon || 0, lat = p.centroid_lat || 0;
    const px = toX(lon), py = toY(lat);
    if (px >= x && px <= x + w && py >= y && py <= y + h) {
      const code = (p.use_code || p.useCode || '')[0];
      const color = USE_CODE_PDF_COLORS[code] || [107, 114, 128];
      pdf.setFillColor(color[0], color[1], color[2]);
      pdf.circle(px, py, 2, 'F');
    }
  });

  // Boundary outline — thick red
  pdf.setDrawColor(220, 38, 38);
  pdf.setLineWidth(3);
  for (let i = 0; i < boundary.length - 1; i++) {
    pdf.line(toX(boundary[i][0]), toY(boundary[i][1]), toX(boundary[i+1][0]), toY(boundary[i+1][1]));
  }
  // Close polygon
  if (boundary.length > 2) {
    const last = boundary[boundary.length - 1];
    const first = boundary[0];
    if (last[0] !== first[0] || last[1] !== first[1]) {
      pdf.line(toX(last[0]), toY(last[1]), toX(first[0]), toY(first[1]));
    }
  }

  // Vertex dots
  pdf.setFillColor(220, 38, 38);
  const n = (boundary[0][0] === boundary[boundary.length-1][0] && boundary[0][1] === boundary[boundary.length-1][1])
    ? boundary.length - 1 : boundary.length;
  for (let i = 0; i < n; i++) {
    pdf.circle(toX(boundary[i][0]), toY(boundary[i][1]), 2.5, 'F');
  }

  // Border
  pdf.setDrawColor(180, 180, 180);
  pdf.setLineWidth(0.5);
  pdf.rect(x, y, w, h, 'S');

  // Legend
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(7);
  pdf.setTextColor(120, 120, 120);
  pdf.text('Blue=residential  Amber=commercial  Purple=industrial  Green=gov/exempt', x + 4, y + h - 4);
}


export async function exportBoundaryPDF({ boundary, insideParcels, selectedFields, allFields, stats, userName }) {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });

  let y = MARGIN;

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Southborough DIF Boundary Report', MARGIN, y + 20);
  y += 30;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Route 9 Corridor District  •  Generated by ${userName}  •  ${new Date().toLocaleDateString()}`, MARGIN, y + 12);
  y += 24;

  pdf.setDrawColor(30, 58, 95);
  pdf.setLineWidth(1.5);
  pdf.line(MARGIN, y, MARGIN + CONTENT_W, y);
  y += 16;

  // Stats
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(30, 58, 95);
  pdf.text(`Parcels: ${stats.count}    •    Assessed: $${(stats.totalAssessed / 1e6).toFixed(1)}M    •    Acres: ${stats.totalAcres.toFixed(0)}    •    Area: ${stats.areaSqMi.toFixed(2)} sq mi`, MARGIN, y + 10);
  y += 24;

  // Map drawn from coordinates
  const mapH = 320;
  drawMapOnPDF(pdf, boundary, insideParcels, MARGIN, y, CONTENT_W, mapH);
  y += mapH + 16;

  // ── Parcel Table ──
  if (selectedFields.length === 0 || insideParcels.length === 0) {
    addFooter(pdf);
    pdf.save('southborough-dif-boundary.pdf');
    return;
  }

  const headers = selectedFields.map(k => getFieldLabel(k, allFields));
  const colWidth = CONTENT_W / selectedFields.length;
  const ROW_H = 16;
  const HEADER_H = 20;

  if (y + HEADER_H + 40 > PAGE_H - MARGIN) {
    addFooter(pdf);
    pdf.addPage();
    y = MARGIN;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42);
  pdf.text(`Parcels Within Boundary (${insideParcels.length})`, MARGIN, y + 14);
  y += 26;

  // Table header
  pdf.setFillColor(30, 58, 95);
  pdf.rect(MARGIN, y, CONTENT_W, HEADER_H, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  headers.forEach((h, i) => {
    pdf.text(h, MARGIN + i * colWidth + 4, y + 13, { maxWidth: colWidth - 8 });
  });
  y += HEADER_H;

  // Sort — empty parcels to bottom
  const sorted = [...insideParcels].sort((a, b) => {
    const aAddr = (a.address || a.addr || '').trim();
    const bAddr = (b.address || b.addr || '').trim();
    if (!aAddr && bAddr) return 1;
    if (aAddr && !bAddr) return -1;
    return ((a.street || '') + aAddr).localeCompare((b.street || '') + bAddr);
  });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);

  sorted.forEach((p, rowIdx) => {
    if (y + ROW_H > PAGE_H - MARGIN - 20) {
      addFooter(pdf);
      pdf.addPage();
      y = MARGIN;

      pdf.setFillColor(30, 58, 95);
      pdf.rect(MARGIN, y, CONTENT_W, HEADER_H, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(255, 255, 255);
      headers.forEach((h, i) => {
        pdf.text(h, MARGIN + i * colWidth + 4, y + 13, { maxWidth: colWidth - 8 });
      });
      y += HEADER_H;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
    }

    if (rowIdx % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(MARGIN, y, CONTENT_W, ROW_H, 'F');
    }

    pdf.setTextColor(51, 65, 85);
    selectedFields.forEach((key, i) => {
      const val = getFieldValue(p, key);
      pdf.text(String(val).substring(0, 40), MARGIN + i * colWidth + 4, y + 11, { maxWidth: colWidth - 8 });
    });

    y += ROW_H;
  });

  addFooter(pdf);
  pdf.save('southborough-dif-boundary.pdf');
}

function addFooter(pdf) {
  const pageCount = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`Page ${i} of ${pageCount}`, PAGE_W / 2, PAGE_H - 25, { align: 'center' });
    pdf.text('Southborough DIF Boundary Editor — googloid.com', PAGE_W / 2, PAGE_H - 15, { align: 'center' });
  }
}
