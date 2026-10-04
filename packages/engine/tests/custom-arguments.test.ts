import { describe, expect, it } from 'vitest';
import { parseJvmArguments } from '../src/utils/arguments';
describe('Additional JVM arguments', () => {
  it('keeps spaces and Windows backslashes inside quoted properties', () => {
    expect(parseJvmArguments('-Dpath="C:\\Games\\My Pack" -Dlabel=hello')).toEqual(['-Dpath=C:\\Games\\My Pack', '-Dlabel=hello']);
  });
  it('supports quoted values and returns an empty list for blank input', () => {
    expect(parseJvmArguments("-Dlabel='two words'\n-XX:+UseG1GC")).toEqual(['-Dlabel=two words', '-XX:+UseG1GC']);
    expect(parseJvmArguments(' ')).toEqual([]);
  });
  it('rejects incomplete arguments before starting Java', () => {
    expect(() => parseJvmArguments('-Dlabel="incomplete')).toThrow('guillemet');
  });
});
