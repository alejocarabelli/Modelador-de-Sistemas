import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';
import { describe, expect, it } from 'vitest';

describe.skipIf(platform !== 'darwin')('macOS files bridge on disk', () => {
  it('keeps the original name when importing and serves files as HTTP 200 through the scheme', () => {
    const directory = mkdtempSync(join(tmpdir(), 'modelador-files-test-'));
    const binary = join(directory, 'files-test');
    try {
      execFileSync('clang', ['-fobjc-arc', '-Wno-nullability-completeness', '-Wno-nullability-completeness-on-arrays', '-framework', 'Cocoa', '-framework', 'WebKit', 'macos/FilesBridge.test.m', '-o', binary]);
      const output = execFileSync(binary, [directory], { encoding: 'utf8', timeout: 25_000 });
      expect(output).toContain('pick names, gc and scheme response checks passed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
