/**
 * scene-stub.test.js — scene-stub.js no-op sceneController shim'i
 */
import { describe, it, expect, vi } from 'vitest';
import { createSceneController, deriveSceneData } from '../scene-stub.js';

describe('createSceneController stub', () => {
  it('sceneData metrics yansıtılır', () => {
    const sd = { roomWidthM: 2.5, roomDepthM: 3.0 };
    const ctrl = createSceneController({ sceneData: sd });
    expect(ctrl.metrics.roomWidthM).toBe(2.5);
    expect(ctrl.metrics.roomDepthM).toBe(3.0);
  });

  it('boş sceneData için metrics 0', () => {
    const ctrl = createSceneController({ sceneData: {} });
    expect(ctrl.metrics.roomWidthM).toBe(0);
    expect(ctrl.metrics.roomDepthM).toBe(0);
  });

  it('setCamera custom event yayınlar', () => {
    const ctrl = createSceneController({ sceneData: {} });
    const handler = vi.fn();
    window.addEventListener('r3f:set-camera', handler);
    ctrl.setCamera('floor');
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail).toBe('floor');
  });

  it('render fonksiyonları no-op (hata atmaz)', () => {
    const ctrl = createSceneController({ sceneData: {} });
    expect(() => ctrl.renderStructureModel()).not.toThrow();
    expect(() => ctrl.renderLayouts()).not.toThrow();
    expect(() => ctrl.renderFixtures()).not.toThrow();
    expect(() => ctrl.addRoomModel()).not.toThrow();
    expect(() => ctrl.resize()).not.toThrow();
    expect(() => ctrl.start()).not.toThrow();
    expect(ctrl.getWarnings()).toEqual([]);
  });
});

describe('deriveSceneData re-export', () => {
  it('scene-stub deriveSceneData fonksiyonunu re-export eder', () => {
    expect(typeof deriveSceneData).toBe('function');
  });
});
