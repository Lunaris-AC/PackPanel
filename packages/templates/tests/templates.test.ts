import { describe, it, expect } from 'vitest';
import { TEMPLATES, getTemplateCss } from '../src/index.js';

describe('Templates: Definitions & Styles', () => {
  it('exposes all three official templates', () => {
    expect(TEMPLATES.minimal).toBeDefined();
    expect(TEMPLATES.community).toBeDefined();
    expect(TEMPLATES.network).toBeDefined();
  });

  it('generates root CSS variables with accent color', () => {
    const css = getTemplateCss({
      branding: { accentColor: '#10b981' }
    } as any);

    expect(css).toContain('--packpanel-accent: #10b981');
    expect(css).toContain('--packpanel-bg: #0f172a');
  });
});
