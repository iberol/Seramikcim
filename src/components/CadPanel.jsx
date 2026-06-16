/**
 * CadPanel.jsx — Konva.js tabanlı interaktif CAD paneli (FAZ 4)
 *
 * Zustand store'dan building verisi ve cad slice'ı okur. current_building.json
 * içindeki katmanları (walls, features, surface_segments, wall_segments) Konva
 * Layer'lara map eder. Çizgi seçimi, snap-to-grid sürükleme, undo/redo,
 * katman görünürlüğü destekler.
 *
 * Bu bileşen şu an yan panel olarak çalışır (legacy cad.js paneli ile
 * yan yana, R3F gibi). FAZ 4 tamamlandıktan sonra legacy cad.js kapatılır.
 */
import React, { useRef } from 'react';
import { Stage, Layer, Line, Rect, Text } from 'react-konva';
import { useAppStore } from '../store/useAppStore.js';
import { snapPoint } from '../hooks/useSnapToGrid.js';
import { useCadView } from '../features/cad/hooks/useCadView.js';
import { useCadKeyboard } from '../features/cad/hooks/useCadKeyboard.js';
import { makeLineId, getLinePoly } from '../features/cad/utils/cadGeometry.js';
import { Button } from './ui/Button.jsx';
import { Toggle } from './ui/Toggle.jsx';

const LAYER_DEFS = [
  { id: 'walls',    name: 'Duvarlar',     color: '#d7dadc', strokeWidth: 2 },
  { id: 'features', name: 'Özellikler',   color: '#e7a438', strokeWidth: 1.5 },
  { id: 'floor',    name: 'Zemin ızgara', color: '#5ec4ff', strokeWidth: 1 },
  { id: 'tiles',    name: 'Dekor',        color: '#8aa39a', strokeWidth: 1 },
];

const GRID_MM = 5;

export function CadPanel({ width = 700, height = 500 }) {
  const building = useAppStore((s) => s.building);
  const layerVisibility = useAppStore((s) => s.cadLayerVisibility);
  const selectedIds = useAppStore((s) => s.cadSelectedLineIds);
  const overrides = useAppStore((s) => s.cadLineOverrides);
  const toggleLayer = useAppStore((s) => s.toggleCadLayer);
  const selectLine = useAppStore((s) => s.selectCadLine);
  const clearSelection = useAppStore((s) => s.clearCadSelection);
  const moveLine = useAppStore((s) => s.moveCadLine);
  const undo = useAppStore((s) => s.undoCad);
  const redo = useAppStore((s) => s.redoCad);

  const stageRef = useRef(null);

  const { view, toScreenPoint } = useCadView(building, width, height);

  useCadKeyboard(undo, redo);

  function renderLayer(layerDef) {
    if (!layerVisibility[layerDef.id]) return null;
    const items = building?.[layerDef.id];
    if (!Array.isArray(items)) return null;
    return (
      <Layer key={layerDef.id}>
        {items.map((_item, idx) => {
          const id = makeLineId(layerDef.id, idx);
          const ov = overrides[id];
          if (ov?.hidden) return null;
          const poly = getLinePoly(layerDef.id, idx, building, overrides);
          if (!poly.length) return null;
          const flat = poly.flatMap(([x, y]) => toScreenPoint(x, y, view));
          const selected = selectedIds.includes(id);
          return (
            <Line
              key={id}
              points={flat}
              stroke={selected ? '#ffeb3b' : layerDef.color}
              strokeWidth={selected ? layerDef.strokeWidth + 1.5 : layerDef.strokeWidth}
              closed={poly.length > 2}
              lineCap="round"
              lineJoin="round"
              onClick={(e) => {
                e.cancelBubble = true;
                selectLine(id, e.evt.shiftKey);
              }}
              draggable={selected}
              dragBoundFunc={(pos) => snapPoint(pos, GRID_MM * view.scale)}
              onDragEnd={(e) => {
                const dxScreen = e.target.x();
                const dyScreen = e.target.y();
                if (Math.abs(dxScreen) < 0.5 && Math.abs(dyScreen) < 0.5) return;
                moveLine(id, dxScreen / view.scale, dyScreen / view.scale);
                e.target.position({ x: 0, y: 0 });
              }}
            />
          );
        })}
      </Layer>
    );
  }

  return (
    <div className="cad-konva-panel">
      <div className="cad-konva-toolbar">
        {LAYER_DEFS.map((l) => (
          <div key={l.id} className="cad-konva-layer-toggle" style={{ display: 'inline-flex', alignItems: 'center', marginRight: '12px' }}>
            <Toggle
              checked={!!layerVisibility[l.id]}
              onChange={() => toggleLayer(l.id)}
              label={<span style={{ color: l.color, marginLeft: 6 }}>{l.name}</span>}
            />
          </div>
        ))}
        <Button variant="secondary" onClick={undo} style={{ marginRight: 4 }}>Geri Al</Button>
        <Button variant="secondary" onClick={redo} style={{ marginRight: 4 }}>İleri Al</Button>
        <Button variant="secondary" onClick={clearSelection}>Seçimi Temizle</Button>
        <span className="cad-konva-info" style={{ marginLeft: 'auto' }}>
          Snap: {GRID_MM} mm • Seçili: {selectedIds.length}
        </span>
      </div>

      <Stage
        ref={stageRef}
        width={width}
        height={height}
        onClick={(e) => {
          if (e.target === stageRef.current?.getStage()) clearSelection();
        }}
        style={{ background: '#0e1116', borderRadius: 8 }}
      >
        {/* Grid arka plan */}
        <Layer listening={false}>
          <Rect x={0} y={0} width={width} height={height} fill="#0e1116" />
        </Layer>
        {LAYER_DEFS.map((l) => renderLayer(l))}
        {/* Bilgi etiketi */}
        <Layer listening={false}>
          <Text
            x={10}
            y={10}
            text={building ? 'Konva CAD (FAZ 4)' : 'Building yüklü değil'}
            fontSize={11}
            fill="#6ca9ff"
          />
        </Layer>
      </Stage>
    </div>
  );
}
