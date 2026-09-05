import { describe, it, expect } from 'vitest';
import { safeInternalPath } from '@/lib/safe-path';

const HOME = '/dashboard';

describe('safeInternalPath', () => {
  it('passes ordinary routes through untouched', () => {
    for (const path of [
      '/dashboard',
      '/clinician/today',
      '/medications/add',
      '/vitals?range=30',
      '/settings#privacy',
    ]) {
      expect(safeInternalPath(path, HOME), path).toBe(path);
    }
  });

  it('refuses anything a browser would read as another origin', () => {
    for (const path of [
      '//evil.example',
      '/\\evil.example',
      '//',
      '/\\',
      '/\\/evil.example',
      '//evil.example/dashboard',
      '/dash\\board',
    ]) {
      expect(safeInternalPath(path, HOME), path).toBe(HOME);
    }
  });

  it('refuses an absolute URL or a scheme', () => {
    for (const path of [
      'https://evil.example',
      'http://evil.example',
      'javascript:alert(1)',
      'data:text/html,<script>',
      'mailto:someone@example.com',
    ]) {
      expect(safeInternalPath(path, HOME), path).toBe(HOME);
    }
  });

  it('refuses a relative path, which would resolve against wherever you are', () => {
    for (const path of ['dashboard', '../admin', './settings', '']) {
      expect(safeInternalPath(path, HOME), path).toBe(HOME);
    }
  });

  it('refuses control characters, which browsers strip and then re-parse', () => {
    expect(safeInternalPath('/\t/evil.example', HOME)).toBe(HOME);
    expect(safeInternalPath('/dash\nboard', HOME)).toBe(HOME);
    expect(safeInternalPath('/dash board', HOME)).toBe(HOME);
    expect(safeInternalPath('/\u0000evil', HOME)).toBe(HOME);
  });

  it('refuses anything that is not a string', () => {
    for (const value of [undefined, null, 42, {}, [], { pathname: '/dashboard' }]) {
      expect(safeInternalPath(value, HOME)).toBe(HOME);
    }
  });

  it('trims, because a leading space hides the shape of what follows', () => {
    expect(safeInternalPath('  /vitals', HOME)).toBe('/vitals');
    expect(safeInternalPath('  //evil.example', HOME)).toBe(HOME);
  });
});
