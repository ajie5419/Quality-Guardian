import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadScript } from '../resources';

const testJsPath = 'https://example.com/test.js';

type ScriptListener = (event: Event) => void;

interface MockScriptElement {
  _listeners: Map<string, ScriptListener[]>;
  addEventListener: (type: string, listener: ScriptListener) => void;
  dispatchEvent: (event: Event) => boolean;
  src: string;
}

describe('loadScript', () => {
  let scriptStore: Map<string, MockScriptElement>;
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    scriptStore = new Map();

    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      const match = /^script\[src="(.+)"\]$/.exec(selector);
      if (!match) return null;
      return (scriptStore.get(match[1]) ?? null) as unknown as Element | null;
    });

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName !== 'script') {
        return originalCreateElement(tagName);
      }

      const script: MockScriptElement = {
        src: '',
        _listeners: new Map(),
        addEventListener(type, listener) {
          const current = this._listeners.get(type) ?? [];
          current.push(listener);
          this._listeners.set(type, current);
        },
        dispatchEvent(event) {
          const listeners = this._listeners.get(event.type) ?? [];
          listeners.forEach((listener) => listener(event));
          return true;
        },
      };
      return script as unknown as HTMLElement;
    });

    vi.spyOn(document.head, 'append').mockImplementation(
      (...nodes: (Node | string)[]) => {
        nodes.forEach((node) => {
          if (typeof node !== 'string') {
            const script = node as unknown as MockScriptElement;
            if (script.src) {
              scriptStore.set(script.src, script);
            }
          }
        });
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve when the script loads successfully', async () => {
    const promise = loadScript(testJsPath);

    // 此时脚本元素已被创建并插入
    const script = document.querySelector(
      `script[src="${testJsPath}"]`,
    ) as HTMLScriptElement;
    expect(script).toBeTruthy();

    // 模拟加载成功
    script.dispatchEvent(new Event('load'));

    // 等待 promise resolve
    await expect(promise).resolves.toBeUndefined();
  });

  it('should not insert duplicate script and resolve immediately if already loaded', async () => {
    // 先手动插入一个相同 src 的 script
    const existing = document.createElement('script');
    existing.src = 'bar.js';
    document.head.append(existing);

    // 再次调用
    const promise = loadScript('bar.js');

    // 立即 resolve
    await expect(promise).resolves.toBeUndefined();

    expect(scriptStore.size).toBe(1);
  });

  it('should reject when the script fails to load', async () => {
    const promise = loadScript('error.js');

    const script = document.querySelector(
      'script[src="error.js"]',
    ) as HTMLScriptElement;
    expect(script).toBeTruthy();

    // 模拟加载失败
    script.dispatchEvent(new Event('error'));

    await expect(promise).rejects.toThrow('Failed to load script: error.js');
  });

  it('should handle multiple concurrent calls and only insert one script tag', async () => {
    const p1 = loadScript(testJsPath);
    const p2 = loadScript(testJsPath);

    const script = document.querySelector(
      `script[src="${testJsPath}"]`,
    ) as HTMLScriptElement;
    expect(script).toBeTruthy();

    // 触发一次 load，两个 promise 都应该 resolve
    script.dispatchEvent(new Event('load'));

    await expect(p1).resolves.toBeUndefined();
    await expect(p2).resolves.toBeUndefined();

    expect(scriptStore.size).toBe(1);
  });
});
