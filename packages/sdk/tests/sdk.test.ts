import { describe, it, expect } from 'vitest';
import { PackPanelApiClient, createLauncherEngine } from '../src/index.js';

describe('SDK: PackPanelApiClient & Factory', () => {
  it('instantiates API client with clean base URL', () => {
    const client = new PackPanelApiClient({
      baseUrl: 'https://packpanel.example.com///',
      apiToken: 'token_123'
    });
    expect(client).toBeDefined();
  });

  it('instantiates launcher engine via helper', () => {
    const engine = createLauncherEngine('/fake/game/dir');
    expect(engine).toBeDefined();
  });
});
