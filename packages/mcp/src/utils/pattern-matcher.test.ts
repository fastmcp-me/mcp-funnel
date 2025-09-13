import { describe, it, expect } from 'vitest';
import { matchesPattern } from './pattern-matcher.js';

describe('matchesPattern', () => {
  it('should match exact strings', () => {
    expect(matchesPattern('test', 'test')).toBe(true);
    expect(matchesPattern('test', 'other')).toBe(false);
  });

  it('should match with wildcard at end', () => {
    expect(matchesPattern('test_tool', 'test_*')).toBe(true);
    expect(matchesPattern('test', 'test_*')).toBe(false);
  });

  it('should match with wildcard at beginning', () => {
    expect(matchesPattern('my_test', '*_test')).toBe(true);
    expect(matchesPattern('test', '*_test')).toBe(false);
  });

  it('should match with wildcard in middle', () => {
    expect(matchesPattern('foo_bar_baz', 'foo_*_baz')).toBe(true);
    expect(matchesPattern('foo_baz', 'foo_*_baz')).toBe(false);
  });

  it('should match with multiple wildcards', () => {
    expect(matchesPattern('github__create_issue', '*__create_*')).toBe(true);
    expect(matchesPattern('memory__store_data', '*__*_data')).toBe(true);
  });

  it('should match single wildcard to match everything', () => {
    expect(matchesPattern('anything', '*')).toBe(true);
    expect(matchesPattern('', '*')).toBe(true);
  });

  it('should handle special regex characters', () => {
    expect(matchesPattern('test.tool', 'test.tool')).toBe(true);
    expect(matchesPattern('test[tool]', 'test[tool]')).toBe(true);
    expect(matchesPattern('test(tool)', 'test(tool)')).toBe(true);
  });

  it('should handle hyphenated patterns correctly', () => {
    expect(matchesPattern('test-tool', 'test-tool')).toBe(true);
    expect(matchesPattern('test-tool', 'test-*')).toBe(true);
    expect(matchesPattern('test-tool-name', '*-tool-*')).toBe(true);
    expect(matchesPattern('my-test-tool', 'my-*')).toBe(true);
    expect(matchesPattern('test-tool', 'test_tool')).toBe(false);
  });
});
