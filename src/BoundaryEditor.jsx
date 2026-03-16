import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { pointInPolygon, parcelNearBoundary, polygonAreaSqMi } from './geometry';
import { exportBoundaryPDF } from './pdfExport';

const DEFAULT_BOUNDARY = [
  [-71.536,42.290],[-71.537,42.293],[-71.538,42.296],[-71.540,42.299],
  [-71.541,42.302],[-71.540,42.305],[-71.538,42.308],[-71.537,42.309],
  [-71.535,42.308],[-71.533,42.308],[-71.530,42.308],[-71.527,42.308],
  [-71.524,42.309],[-71.522,42.310],[-71.524,42.312],[-71.524,42.316],
  [-71.524,42.318],[-71.520,42.319],[-71.516,42.318],[-71.510,42.316],
  [-71.509,42.314],[-71.509,42.312],[-71.509,42.310],[-71.507,42.308],
  [-71.505,42.306],[-71.500,42.304],[-71.496,42.303],[-71.490,42.305],
  [-71.488,42.304],[-71.488,42.301],[-71.490,42.299],[-71.492,42.297],
  [-71.495,42.295],[-71.498,42.294],[-71.502,42.293],[-71.508,42.292],
  [-71.514,42.291],[-71.520,42.290],[-71.525,42.290],[-71.528,42.291],
  [-71.532,42.290],[-71.536,42.290]
];

const TOUCH_THRESHOLD = 200;
const USE_CODE_COLORS = { '1': '#3b82f6', '3': '#f59e0b', '4': '#8b5cf6', '9': '#10b981', '8': '#10b981' };

const ALL_FIELDS = [
  { key: 'address', label: 'Address' },
  { key: 'street', label: 'Street' },
  { key: 'owner', label: 'Owner' },
  { key: 'total_val', label: 'Total Assessed Value' },
  { key: 'bldg_val', label: 'Building Value' },
  { key: 'land_val', label: 'Land Value' },
  { key: 'lot_size', label: 'Lot Size (acres)' },
  { key: 'use_code', label: 'Use Code' },
  { key: 'centroid_lat', label: 'Latitude' },
  { key: 'centroid_lon', label: 'Longitude' },
];

export default function BoundaryEditor({ allParcels, authToken, currentUser }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const polygonRef = useRef(null);
  const vertexMarkersRef = useRef([]);
  const midpointMarkersRef = useRef([]);
  const parcelMarkersRef = useRef([]);
  const overlayRef = useRef(null);
  const boundaryRef = useRef(null);

  const [boundary, setBoundaryState] = useState([...DEFAULT_BOUNDARY, DEFAULT_BOUNDARY[0]]);
  const [mode, setMode] = useState('move');
  const [history, setHistory] = useState([]);
  const [insideParcels, setInsideParcels] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOverlay, setShowOverlay] = useState(false);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  // PDF field selection
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [selectedFields, setSelectedFields] = useState(() =>
    ALL_FIELDS.map(f => f.key) // all selected by default
  );
  const [exporting, setExporting] = useState(false);

  const setBoundary = useCallback((valOrFn) => {
    setBoundaryState(prev => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      boundaryRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => { boundaryRef.current = boundary; }, []);

  const authHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };

  // Load user's boundary from server
  useEffect(() => {
    fetch('/api/boundary', { headers: { 'Authorization': `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(data => {
        if (data.cleared) {
          // User previously cleared — show empty
          setBoundary([]);
        } else if (data.vertices && data.vertices.length >= 3) {
          let verts = data.vertices;
          if (verts[0][0] !== verts[verts.length-1][0] || verts[0][1] !== verts[verts.length-1][1]) {
            verts = [...verts, verts[0]];
          }
          setBoundary(verts);
        }
        // else: no saved boundary → keep DEFAULT_BOUNDARY
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [authToken]);

  const computeInsideParcels = useCallback((verts) => {
    if (!allParcels || !verts || verts.length < 3) return [];
    const closed = verts[0][0] === verts[verts.length-1][0] && verts[0][1] === verts[verts.length-1][1]
      ? verts : [...verts, verts[0]];
    return allParcels.filter(p => {
      const lon = p.centroid_lon || 0, lat = p.centroid_lat || 0;
      return pointInPolygon(lon, lat, closed) || parcelNearBoundary(lon, lat, closed, TOUCH_THRESHOLD);
    });
  }, [allParcels]);

  useEffect(() => {
    setInsideParcels(computeInsideParcels(boundary));
    setSaved(false);
  }, [boundary, computeInsideParcels]);

  const totalVal = insideParcels.reduce((s, p) => s + (p.total_val || p.totalVal || 0), 0);
  const totalAcres = insideParcels.reduce((s, p) => s + (p.lot_size || p.acres || 0), 0);
  const areaSqMi = boundary.length >= 3 ? polygonAreaSqMi(boundary) : 0;
  const vertexCount = boundary.length > 0 && boundary[0][0] === boundary[boundary.length-1][0] ? boundary.length - 1 : boundary.length;

  // ── Map init ──
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current || loading) return;
    const map = L.map(mapRef.current, { zoomControl: true }).setView([42.304, -71.516], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OSM', maxZoom: 19
    }).addTo(map);
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri', maxZoom: 19
    });
    L.control.layers({ 'Street': map._layers[Object.keys(map._layers)[0]], 'Satellite': sat }).addTo(map);
    mapInstanceRef.current = map;
    setMapReady(true);
    return () => { map.remove(); mapInstanceRef.current = null; setMapReady(false); };
  }, [loading]);

  // ── Render map ──
  const renderMap = useCallback(() => {
    const map = mapInstanceRef.current;
    const currentBoundary = boundaryRef.current || boundary;
    if (!map) return;

    if (polygonRef.current) map.removeLayer(polygonRef.current);
    vertexMarkersRef.current.forEach(m => map.removeLayer(m));
    midpointMarkersRef.current.forEach(m => map.removeLayer(m));
    parcelMarkersRef.current.forEach(m => map.removeLayer(m));
    vertexMarkersRef.current = [];
    midpointMarkersRef.current = [];
    parcelMarkersRef.current = [];

    if (currentBoundary.length < 3) {
      // Still show parcels even with no boundary
      allParcels.forEach(p => {
        const lon = p.centroid_lon || 0, lat = p.centroid_lat || 0;
        const code = (p.use_code || p.useCode || '')[0];
        const color = USE_CODE_COLORS[code] || '#6b7280';
        const cm = L.circleMarker([lat, lon], { radius: 3, fillColor: color, color: '#999', weight: 0.5, fillOpacity: 0.2 });
        const val = (p.total_val || p.totalVal || 0);
        const valStr = val >= 1e6 ? '$' + (val/1e6).toFixed(1) + 'M' : '$' + Math.round(val/1e3) + 'K';
        cm.bindPopup(`<b>${p.address || p.addr}</b><br>${p.street || ''}<br>${p.owner}<br>${valStr}`);
        cm.addTo(map);
        parcelMarkersRef.current.push(cm);
      });
      return;
    }

    const latLngs = currentBoundary.map(b => [b[1], b[0]]);
    polygonRef.current = L.polygon(latLngs, {
      color: '#dc2626', weight: 7, fillColor: '#dc2626',
      fillOpacity: 0.12, interactive: false
    }).addTo(map);

    const n = currentBoundary[0][0] === currentBoundary[currentBoundary.length-1][0] &&
              currentBoundary[0][1] === currentBoundary[currentBoundary.length-1][1]
      ? currentBoundary.length - 1 : currentBoundary.length;

    for (let i = 0; i < n; i++) {
      const [lon, lat] = currentBoundary[i];
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;background:${mode === 'delete' ? '#ef4444' : '#dc2626'};border:2px solid white;border-radius:50%;cursor:${mode === 'move' ? 'grab' : 'pointer'};box-shadow:0 1px 3px rgba(0,0,0,0.3);margin-left:-7px;margin-top:-7px;"></div>`,
        iconSize: [14, 14]
      });
      const marker = L.marker([lat, lon], { icon, draggable: mode === 'move' });

      if (mode === 'move') {
        marker.on('dragstart', () => {
          setHistory(h => [...h.slice(-49), JSON.parse(JSON.stringify(boundaryRef.current))]);
        });
        marker.on('drag', (e) => {
          const pos = e.target.getLatLng();
          const cur = boundaryRef.current;
          if (!cur) return;
          const next = [...cur];
          next[i] = [pos.lng, pos.lat];
          if (i === 0 && next.length > 1) next[next.length - 1] = [pos.lng, pos.lat];
          boundaryRef.current = next;
          if (polygonRef.current) polygonRef.current.setLatLngs(next.map(b => [b[1], b[0]]));
        });
        marker.on('dragend', () => {
          const final = boundaryRef.current;
          if (final) setBoundaryState([...final]);
        });
      }

      if (mode === 'delete') {
        marker.on('click', () => {
          if (n <= 3) return;
          setHistory(h => [...h.slice(-49), JSON.parse(JSON.stringify(currentBoundary))]);
          setBoundary(prev => {
            const next = [...prev];
            next.splice(i, 1);
            if (i === 0 && next.length > 0) next[next.length - 1] = [...next[0]];
            return next;
          });
        });
      }

      marker.bindTooltip(`Vertex ${i + 1}`, { direction: 'top', offset: [0, -10] });
      marker.addTo(map);
      vertexMarkersRef.current.push(marker);

      if (mode === 'move') {
        const ni = (i + 1) % n;
        const mLon = (currentBoundary[i][0] + currentBoundary[ni][0]) / 2;
        const mLat = (currentBoundary[i][1] + currentBoundary[ni][1]) / 2;
        const mIcon = L.divIcon({
          className: '',
          html: '<div style="width:10px;height:10px;background:rgba(37,99,235,0.6);border:1.5px solid white;border-radius:50%;cursor:pointer;margin-left:-5px;margin-top:-5px;"></div>',
          iconSize: [10, 10]
        });
        const mid = L.marker([mLat, mLon], { icon: mIcon });
        mid.on('click', () => {
          setHistory(h => [...h.slice(-49), JSON.parse(JSON.stringify(currentBoundary))]);
          setBoundary(prev => { const next = [...prev]; next.splice(i + 1, 0, [mLon, mLat]); return next; });
        });
        mid.bindTooltip('Click to add vertex', { direction: 'top', offset: [0, -8] });
        mid.addTo(map);
        midpointMarkersRef.current.push(mid);
      }
    }

    // Parcels
    const closed = currentBoundary[0][0] === currentBoundary[currentBoundary.length-1][0] ? currentBoundary : [...currentBoundary, currentBoundary[0]];
    allParcels.forEach(p => {
      const lon = p.centroid_lon || 0, lat = p.centroid_lat || 0;
      const inside = pointInPolygon(lon, lat, closed);
      const touching = !inside && parcelNearBoundary(lon, lat, closed, TOUCH_THRESHOLD);
      const included = inside || touching;
      const code = (p.use_code || p.useCode || '')[0];
      const color = USE_CODE_COLORS[code] || '#6b7280';
      const val = (p.total_val || p.totalVal || 0);
      const valStr = val >= 1e6 ? '$' + (val/1e6).toFixed(1) + 'M' : '$' + Math.round(val/1e3) + 'K';

      const cm = L.circleMarker([lat, lon], {
        radius: included ? 5 : 3,
        fillColor: color, color: included ? '#fff' : '#999',
        weight: included ? 1.5 : 0.5, fillOpacity: included ? 0.85 : 0.2,
      });
      cm.bindPopup(`<b>${p.address || p.addr}</b><br>${p.street || ''}<br>${p.owner}<br>${valStr}<br><em>${included ? (touching ? 'Touching' : 'Inside') : 'Outside'}</em>`);
      cm.addTo(map);
      parcelMarkersRef.current.push(cm);
    });
  }, [mode, allParcels, mapReady]);

  useEffect(() => { if (mapReady) renderMap(); }, [boundary, mode, renderMap, mapReady]);

  // Click-to-add
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const handler = (e) => {
      if (mode !== 'add') return;
      const lon = e.latlng.lng, lat = e.latlng.lat;
      const cur = boundaryRef.current || boundary;
      if (cur.length < 2) {
        setBoundary(prev => [...prev, [lon, lat]]);
        return;
      }
      let bestDist = Infinity, bestIdx = 0;
      for (let i = 0; i < cur.length - 1; i++) {
        const dx = cur[i+1][0] - cur[i][0], dy = cur[i+1][1] - cur[i][1];
        const lenSq = dx*dx + dy*dy;
        const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((lon - cur[i][0])*dx + (lat - cur[i][1])*dy) / lenSq));
        const cx = cur[i][0] + t*dx, cy = cur[i][1] + t*dy;
        const d = Math.sqrt((lon-cx)**2 + (lat-cy)**2);
        if (d < bestDist) { bestDist = d; bestIdx = i + 1; }
      }
      setHistory(h => [...h.slice(-49), JSON.parse(JSON.stringify(cur))]);
      setBoundary(prev => { const next = [...prev]; next.splice(bestIdx, 0, [lon, lat]); return next; });
    };
    map.on('click', handler);
    return () => map.off('click', handler);
  }, [mode]);

  // Overlay toggle
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (showOverlay && !overlayRef.current) {
      const bounds = [[42.285, -71.545], [42.325, -71.480]];
      overlayRef.current = L.imageOverlay('/district-map.png', bounds, { opacity: 0.3 }).addTo(map);
    } else if (!showOverlay && overlayRef.current) {
      map.removeLayer(overlayRef.current);
      overlayRef.current = null;
    }
  }, [showOverlay]);

  // ── Actions ──
  const undo = () => {
    if (history.length === 0) return;
    setBoundary(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
  };

  const resetBoundary = async () => {
    if (!window.confirm('Reset to the original default boundary?')) return;
    setHistory(h => [...h.slice(-49), JSON.parse(JSON.stringify(boundary))]);
    setBoundary([...DEFAULT_BOUNDARY, DEFAULT_BOUNDARY[0]]);
    try {
      await fetch('/api/boundary/reset', { method: 'POST', headers: authHeaders });
    } catch {}
    flash('Reset to default');
  };

  const clearBoundary = async () => {
    if (!window.confirm('Clear the entire boundary? You will start with a blank map.')) return;
    setHistory([]);
    setBoundary([]);
    setInsideParcels([]);
    try {
      await fetch('/api/boundary/clear', { method: 'POST', headers: authHeaders });
    } catch {}
    flash('Boundary cleared');
  };

  const saveBoundary = async () => {
    const verts = boundary.length > 0 && boundary[0][0] === boundary[boundary.length-1][0]
      ? boundary.slice(0, -1) : boundary;
    try {
      const res = await fetch('/api/boundary', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ vertices: verts, parcelsInsideCount: insideParcels.length })
      });
      if (res.ok) {
        flash('Saved!');
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json();
        flash(data.error || 'Save failed', true);
      }
    } catch {
      flash('Server not available', true);
    }
  };

  const flash = (msg, isError) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 3000);
  };

  const toggleField = (key) => {
    setSelectedFields(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      await exportBoundaryPDF({
        boundary, insideParcels, selectedFields, allFields: ALL_FIELDS,
        stats: { count: insideParcels.length, totalAssessed: totalVal, totalAcres, areaSqMi },
        userName: currentUser.displayName,
        mapElement: mapRef.current
      });
    } catch (e) {
      console.error('PDF export error:', e);
      flash('PDF export failed', true);
    }
    setExporting(false);
    setShowExportPanel(false);
  };

  const filteredParcels = searchTerm
    ? insideParcels.filter(p => ((p.address||p.addr)+' '+(p.street||'')+' '+p.owner).toLowerCase().includes(searchTerm.toLowerCase()))
    : insideParcels;

  const modeLabels = { move: 'Drag vertices to reshape', add: 'Click map to add points', delete: 'Click vertices to remove' };

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>Loading your boundary...</div>;
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: '320px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>

        {/* Tools */}
        <div style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
          <div style={{ fontSize: '13px', color: '#475569', fontWeight: 600, marginBottom: '8px' }}>Edit Tools</div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
            {['move', 'add', 'delete'].map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{
                  padding: '5px 10px', border: '1px solid ' + (mode === m ? '#1e3a5f' : '#cbd5e1'),
                  borderRadius: '5px', background: mode === m ? '#1e3a5f' : 'white',
                  color: mode === m ? 'white' : (m === 'delete' ? '#dc2626' : '#334155'),
                  cursor: 'pointer', fontSize: '12px'
                }}>
                {m === 'move' ? 'Move' : m === 'add' ? '+ Add' : 'Delete'}
              </button>
            ))}
            <button onClick={undo} disabled={history.length === 0}
              style={{ padding: '5px 10px', border: '1px solid #cbd5e1', borderRadius: '5px', background: 'white',
                cursor: history.length > 0 ? 'pointer' : 'not-allowed', fontSize: '12px', color: '#334155',
                opacity: history.length > 0 ? 1 : 0.5 }}>Undo</button>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <button onClick={resetBoundary}
              style={toolBtn}>Reset to Default</button>
            <button onClick={clearBoundary}
              style={{ ...toolBtn, borderColor: '#fca5a5', background: '#fef2f2', color: '#991b1b' }}>Clear All</button>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <button onClick={saveBoundary}
              style={{
                padding: '5px 12px', border: '1px solid #059669', borderRadius: '5px',
                background: saved ? '#059669' : 'white', color: saved ? 'white' : '#059669',
                cursor: 'pointer', fontSize: '12px', fontWeight: 600
              }}>
              {saved ? '✓ Saved!' : 'Save Boundary'}
            </button>
            <button onClick={() => setShowExportPanel(!showExportPanel)}
              style={{ ...toolBtn, borderColor: '#6366f1', color: '#6366f1' }}>
              Export PDF
            </button>
          </div>
          <div style={{ marginTop: '6px' }}>
            <label style={{ fontSize: '12px', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input type="checkbox" checked={showOverlay} onChange={e => setShowOverlay(e.target.checked)} />
              Show Discussion Draft overlay
            </label>
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{modeLabels[mode]}</div>
          {status && (
            <div style={{ marginTop: '4px', fontSize: '11px', color: status.includes('fail') || status.includes('not available') ? '#dc2626' : '#059669', fontWeight: 600 }}>
              {status}
            </div>
          )}
        </div>

        {/* Export Panel */}
        {showExportPanel && (
          <div style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', background: '#fefce8' }}>
            <div style={{ fontSize: '13px', color: '#475569', fontWeight: 600, marginBottom: '8px' }}>PDF Export — Select Fields</div>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              <button onClick={() => setSelectedFields(ALL_FIELDS.map(f => f.key))}
                style={{ padding: '3px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white', color: '#334155', cursor: 'pointer', fontSize: '11px' }}>
                Select All
              </button>
              <button onClick={() => setSelectedFields([])}
                style={{ padding: '3px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white', color: '#334155', cursor: 'pointer', fontSize: '11px' }}>
                Deselect All
              </button>
            </div>
            {ALL_FIELDS.map(f => (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155', marginBottom: '3px', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedFields.includes(f.key)} onChange={() => toggleField(f.key)} />
                {f.label}
              </label>
            ))}
            <button onClick={handleExportPDF} disabled={exporting || selectedFields.length === 0}
              style={{
                marginTop: '8px', width: '100%', padding: '8px', border: 'none', borderRadius: '6px',
                background: exporting ? '#94a3b8' : '#6366f1', color: 'white', cursor: exporting ? 'wait' : 'pointer',
                fontSize: '13px', fontWeight: 600
              }}>
              {exporting ? 'Generating PDF...' : `Export PDF (${selectedFields.length} fields)`}
            </button>
          </div>
        )}

        {/* Stats */}
        <div style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
          <div style={{ fontSize: '13px', color: '#475569', marginBottom: '8px', fontWeight: 600 }}>District Statistics</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <StatCard label="Parcels" value={insideParcels.length} />
            <StatCard label="Assessed Value" value={totalVal >= 1e6 ? '$' + (totalVal/1e6).toFixed(1) + 'M' : '$' + Math.round(totalVal/1e3) + 'K'} small />
            <StatCard label="Total Acres" value={totalAcres.toFixed(0)} />
            <StatCard label="Vertices" value={vertexCount} />
          </div>
          <div style={{
            marginTop: '8px', padding: '6px 8px', borderRadius: '5px', fontSize: '12px',
            background: areaSqMi > 3.9 ? '#fef2f2' : '#ecfdf5',
            color: areaSqMi > 3.9 ? '#991b1b' : '#065f46',
            border: '1px solid ' + (areaSqMi > 3.9 ? '#fca5a5' : '#6ee7b7')
          }}>
            DIF Area: <b>{areaSqMi.toFixed(2)} sq mi</b> {areaSqMi > 3.9 ? '— exceeds 3.9 sq mi limit!' : `of 3.9 sq mi limit (${(areaSqMi/3.9*100).toFixed(0)}%)`}
          </div>
        </div>

        {/* Parcel List */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', background: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>Parcels ({filteredParcels.length})</span>
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search..." style={{ padding: '3px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', width: '120px' }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredParcels.sort((a, b) => {
              const aAddr = (a.address||a.addr||'').trim();
              const bAddr = (b.address||b.addr||'').trim();
              if (!aAddr && bAddr) return 1;
              if (aAddr && !bAddr) return -1;
              return ((a.street||'')+aAddr).localeCompare((b.street||'')+bAddr);
            }).map((p, i) => {
              const val = (p.total_val || p.totalVal || 0);
              const valStr = val >= 1e6 ? '$' + (val/1e6).toFixed(1) + 'M' : '$' + Math.round(val/1e3) + 'K';
              return (
                <div key={p.id || i}
                  onClick={() => mapInstanceRef.current?.setView([p.centroid_lat, p.centroid_lon], 17)}
                  style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600, color: '#1e3a5f' }}>{p.address || p.addr}</div>
                  <div style={{ color: '#64748b', marginTop: '1px' }}>{p.street || ''} • {valStr} • {(p.lot_size || p.acres || 0).toFixed(2)} ac</div>
                </div>
              );
            })}
            {filteredParcels.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                {boundary.length < 3 ? 'Draw a boundary to see parcels' : 'No parcels found'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

const toolBtn = {
  padding: '5px 10px', border: '1px solid #cbd5e1', borderRadius: '5px',
  background: 'white', cursor: 'pointer', fontSize: '12px', color: '#334155'
};

function StatCard({ label, value, small }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: '5px', padding: '6px 8px', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: '11px', color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: small ? '14px' : '18px', fontWeight: 700, color: '#1e3a5f' }}>{value}</div>
    </div>
  );
}
