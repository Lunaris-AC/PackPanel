import type { LauncherBranding } from '@packpanel/protocol';

export function launcherBranding(project: {
  title: string;
  accent_color: string;
  background_url?: string | null;
  logo_url?: string | null;
  icon_url?: string | null;
  discord_url?: string | null;
  website_url?: string | null;
}): LauncherBranding {
  return {
    title: project.title,
    accentColor: project.accent_color,
    backgroundUrl: project.background_url || undefined,
    logoUrl: project.logo_url || undefined,
    iconUrl: project.icon_url || undefined,
    discordUrl: project.discord_url || undefined,
    websiteUrl: project.website_url || undefined
  };
}
