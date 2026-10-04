import { describe, it, expect } from 'vitest';
import {
  InstanceManifestV2Schema,
  LauncherConfigV2Schema,
  LauncherBrandingSchema
} from '../src/index';

describe('@packpanel/protocol: InstanceManifestV2 validation', () => {
  it('validates a correct V2 instance manifest', () => {
    const validManifest = {
      formatVersion: 2,
      instanceId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      instanceName: 'Test Modpack',
      slug: 'test-modpack',
      minecraftVersion: '1.20.1',
      loader: {
        type: 'fabric',
        version: '0.16.5'
      },
      java: {
        majorVersion: 17,
        recommendedMemoryMb: 4096,
        jvmArgs: ['-Xms2G', '-Xmx4G']
      },
      server: {
        address: 'play.example.com',
        port: 25565,
        name: 'Official Server'
      },
      protectedPaths: ['saves/', 'screenshots/'],
      cleanupRules: ['mods'],
      files: [
        {
          path: 'mods/fabric-api.jar',
          sha1: '1234567890abcdef1234567890abcdef12345678',
          size: 2048500,
          url: 'https://cdn.example.com/test-modpack/releases/r0001/mods/fabric-api.jar',
          policy: 'required'
        }
      ],
      updatedAt: new Date().toISOString()
    };

    const parsed = InstanceManifestV2Schema.safeParse(validManifest);
    expect(parsed.success).toBe(true);
  });

  it('rejects manifest with invalid loader type', () => {
    const invalidManifest = {
      formatVersion: 2,
      instanceId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      instanceName: 'Test Modpack',
      slug: 'test-modpack',
      minecraftVersion: '1.20.1',
      loader: {
        type: 'unknown-loader'
      },
      java: { majorVersion: 17 },
      protectedPaths: [],
      cleanupRules: [],
      files: [],
      updatedAt: new Date().toISOString()
    };

    const parsed = InstanceManifestV2Schema.safeParse(invalidManifest);
    expect(parsed.success).toBe(false);
  });
});

describe('@packpanel/protocol: LauncherConfigV2 validation', () => {
  it('validates a correct launcher configuration', () => {
    const validConfig = {
      formatVersion: 2,
      launcherId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      name: 'Inferi Launcher',
      slug: 'inferi-launcher',
      template: 'community',
      branding: {
        title: 'Inferi Community Launcher',
        accentColor: '#6366f1',
        discordUrl: 'https://discord.gg/example'
      },
      auth: {
        microsoft: true,
        offline: true
      },
      instances: [
        {
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          slug: 'test-modpack',
          name: 'Main Modpack',
          manifestUrl: 'https://cdn.example.com/test-modpack/packpanel.json',
          isDefault: true
        }
      ]
    };

    const parsed = LauncherConfigV2Schema.safeParse(validConfig);
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid hex accent colors in branding', () => {
    const invalidBranding = {
      title: 'Bad Color Launcher',
      accentColor: 'red' // Not a valid #rrggbb hex
    };

    const parsed = LauncherBrandingSchema.safeParse(invalidBranding);
    expect(parsed.success).toBe(false);
  });
});
