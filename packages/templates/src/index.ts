import { LauncherTemplate, LauncherConfigV2 } from '@packpanel/protocol';

export interface TemplateDefinition {
  id: LauncherTemplate;
  name: string;
  description: string;
  previewImage: string;
  features: string[];
  defaultAccentColor: string;
}

export const TEMPLATES: Record<LauncherTemplate, TemplateDefinition> = {
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Design épuré et ultra-rapide. Met l\'accent sur le bouton Jouer, la barre de progression et les réglages essentiels.',
    previewImage: 'template_minimal.png',
    features: [
      'Lancement en 1 clic',
      'Barre de progression fluide',
      'Sélecteur de mémoire RAM intégré',
      'Thème sombre compact'
    ],
    defaultAccentColor: '#6366f1'
  },
  community: {
    id: 'community',
    name: 'Community',
    description: 'Idéal pour les serveurs et communautés. Intègre le fil d\'actualités, le lien Discord, l\'état du serveur en direct et les réseaux sociaux.',
    previewImage: 'template_community.png',
    features: [
      'Bannière d\'actualités et annonces',
      'Widget Discord avec compteur de membres',
      'Statut du serveur Minecraft (joueurs en ligne & ping)',
      'Liens réseaux sociaux et boutique'
    ],
    defaultAccentColor: '#3b82f6'
  },
  network: {
    id: 'network',
    name: 'Network',
    description: 'Conçu pour les réseaux multi-serveurs ou multi-modpacks. Navigation latérale avec liste des instances et serveurs.',
    previewImage: 'template_network.png',
    features: [
      'Barre latérale multi-instances / modpacks',
      'Moniteur de serveurs en direct avec ping',
      'Gestionnaire de profils et versions avancé',
      'Logs de jeu en direct dans une console intégrée'
    ],
    defaultAccentColor: '#10b981'
  }
};

export function getTemplateCss(config: LauncherConfigV2): string {
  const accent = config.branding.accentColor || '#6366f1';
  return `
    :root {
      --packpanel-accent: ${accent};
      --packpanel-accent-hover: ${adjustColorBrightness(accent, -15)};
      --packpanel-bg: #0f172a;
      --packpanel-surface: #1e293b;
      --packpanel-border: #334155;
      --packpanel-text: #f8fafc;
      --packpanel-text-muted: #94a3b8;
    }
  `;
}

function adjustColorBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (
    0x1000000 +
    (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
    (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
    (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1);
}
