/**
 * toast.test.js — src/toast.js DOM toast bildirim testleri
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toast, toastSuccess, toastWarning, toastError, toastInfo } from '../src/toast.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('toast', () => {
  it('DOM container ve toast elementi oluşturur', () => {
    toast('Test mesaj', 'info', 0);
    const container = document.getElementById('seramikcim-toast-container');
    expect(container).toBeTruthy();
    expect(container.querySelectorAll('.toast').length).toBe(1);
  });

  it('mesaj içeriği doğru yansır', () => {
    toast('Hello world', 'info', 0);
    const el = document.querySelector('.toast .toast-message');
    expect(el.textContent).toBe('Hello world');
  });

  it('type class doğru atanır', () => {
    toast('success!', 'success', 0);
    toast('error!', 'error', 0);
    expect(document.querySelector('.toast-success')).toBeTruthy();
    expect(document.querySelector('.toast-error')).toBeTruthy();
  });

  it('geçersiz type info default fallback', () => {
    toast('msg', 'rainbow', 0);
    expect(document.querySelector('.toast-info')).toBeTruthy();
  });

  it('error/warning için role=alert; info/success için role=status', () => {
    toast('e', 'error', 0);
    toast('i', 'info', 0);
    const errors = document.querySelectorAll('.toast-error');
    const infos = document.querySelectorAll('.toast-info');
    expect(errors[0].getAttribute('role')).toBe('alert');
    expect(infos[0].getAttribute('role')).toBe('status');
  });

  it('helper fonksiyonlar (toastSuccess/Warning/Error/Info) çalışır', () => {
    toastSuccess('a', 0);
    toastWarning('b', 0);
    toastError('c', 0);
    toastInfo('d', 0);
    expect(document.querySelectorAll('.toast').length).toBe(4);
  });

  it('opts.id ile dedupe — aynı id 2 kez 1 element bırakır', () => {
    toast('first', 'info', 0, { id: 'sim-success' });
    toast('second', 'info', 0, { id: 'sim-success' });
    const all = document.querySelectorAll('[data-toast-id="sim-success"]');
    expect(all.length).toBe(1);
    expect(all[0].querySelector('.toast-message').textContent).toBe('second');
  });

  it('farklı id\'ler ayrı element üretir', () => {
    toast('a', 'info', 0, { id: 'sim-success' });
    toast('b', 'warning', 0, { id: 'sim-warning' });
    expect(document.querySelectorAll('.toast').length).toBe(2);
  });

  it('id olmadan eski davranış — her çağrı yeni element', () => {
    toast('a', 'info', 0);
    toast('b', 'info', 0);
    expect(document.querySelectorAll('.toast').length).toBe(2);
  });
});
