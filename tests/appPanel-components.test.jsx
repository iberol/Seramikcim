/**
 * appPanel-components.test.js — AppPanel JSX render smoke
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import React from 'react';
import {
  AppPanel,
  AppPanelHeader,
  AppPanelBody,
  AppPanelSection,
  AppPanelRow,
  AppPanelSlider,
  AppPanelSelect,
  AppPanelToggle,
  AppPanelButton,
  AppPanelCloseButton,
  AppPanelMinimizeButton,
} from '../src/ui/components/AppPanel.jsx';

let container;
let root;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  container = document.getElementById('root');
  root = createRoot(container);
});

function render(el) {
  act(() => { root.render(el); });
}

describe('AppPanel JSX', () => {
  it('AppPanel + Header + Body render eder', () => {
    render(
      <AppPanel title="Test" onClose={() => {}} onMinimize={() => {}}>
        <div>içerik</div>
      </AppPanel>,
    );
    expect(container.querySelector('.app-panel')).toBeTruthy();
    expect(container.querySelector('.app-panel__title').textContent).toBe('Test');
    expect(container.querySelector('.app-panel__body').textContent).toBe('içerik');
  });

  it('AppPanelCloseButton aria-label ve click', () => {
    const onClose = vi.fn();
    render(<AppPanelCloseButton onClick={onClose} />);
    const btn = container.querySelector('button');
    expect(btn.getAttribute('aria-label')).toBe('Paneli kapat');
    act(() => { btn.click(); });
    expect(onClose).toHaveBeenCalled();
  });

  it('AppPanelMinimizeButton pressed state', () => {
    render(<AppPanelMinimizeButton onClick={() => {}} pressed={true} />);
    const btn = container.querySelector('button');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('AppPanelSection + Row + Slider', () => {
    render(
      <AppPanelSection title="Grup">
        <AppPanelRow label="Derz">
          <AppPanelSlider value={3} min={0} max={10} step={1} onChange={() => {}} unit="mm" showValue />
        </AppPanelRow>
      </AppPanelSection>,
    );
    expect(container.querySelector('.app-section__title').textContent).toBe('Grup');
    expect(container.querySelector('.app-row .app-label').textContent).toBe('Derz');
    expect(container.querySelector('.app-slider').value).toBe('3');
  });

  it('AppPanel minimized body gizler', () => {
    render(
      <AppPanel title="X" minimized onMinimize={() => {}}>
        <div>içerik</div>
      </AppPanel>,
    );
    expect(container.querySelector('.app-panel.panel-minimized')).toBeTruthy();
    expect(container.querySelector('.app-panel__body')).toBeNull();
  });

  it('AppPanelToggle checkbox state', () => {
    const onChange = vi.fn();
    render(<AppPanelToggle checked={true} onChange={onChange} label="Aç" />);
    const input = container.querySelector('input[type="checkbox"]');
    expect(input.checked).toBe(true);
    act(() => { input.click(); });
    expect(onChange.mock.calls[0][0]).toBe(false);
  });

  it('AppPanelSelect options render', () => {
    render(
      <AppPanelSelect
        value="a"
        options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]}
        onChange={() => {}}
        label="Sel"
      />,
    );
    const sel = container.querySelector('select.app-select');
    expect(sel.options.length).toBe(2);
    expect(sel.value).toBe('a');
  });

  it('AppPanelButton variants', () => {
    render(<AppPanelButton variant="primary">Kaydet</AppPanelButton>);
    const btn = container.querySelector('button');
    expect(btn.className).toMatch(/app-btn--primary/);
    expect(btn.textContent).toBe('Kaydet');
  });
});
