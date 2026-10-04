import React, { createContext, useContext, useState, useEffect } from 'react';
import { translateMessage, selectedLanguage, Language, Values } from './text';
export { translateText, translateMessage } from './text';
export type { Language } from './text';


export interface Translations {
  [key: string]: string | Translations;
}

export const translations: Record<Language, Translations> = {
  fr: {
    nav: {
      dashboard: 'Tableau de bord',
      endpoints: 'Modpacks & Endpoints',
      users: 'Utilisateurs & Audit',
      jobs: 'Tâches système',
      logout: 'Déconnexion',
      role_admin: 'Administrateur',
      role_operator: 'Opérateur',
      role_viewer: 'Lecteur',
      language: 'Langue'
    },
    common: {
      save: 'Enregistrer',
      cancel: 'Annuler',
      delete: 'Supprimer',
      edit: 'Modifier',
      create: 'Créer',
      loading: 'Chargement...',
      success: 'Opération réussie',
      error: 'Une erreur est survenue',
      confirm: 'Confirmer',
      close: 'Fermer',
      back: 'Retour',
      refresh: 'Actualiser',
      copy: 'Copier',
      copied: 'Copié !',
      search: 'Rechercher...',
      actions: 'Actions',
      status: 'Statut',
      date: 'Date',
      version: 'Version',
      details: 'Détails',
      yes: 'Oui',
      no: 'Non',
      all: 'Tous'
    },
    setup: {
      badge: 'Configuration initiale',
      title: 'Bienvenue sur PackPanel',
      subtitle: 'Configurons votre instance en quelques étapes avant la première distribution.',
      step1_title: '1. Domaines & Réseau',
      step1_desc: 'Configurez vos FQDN de distribution et d’administration routés par Zoraxy ou Cloudflare.',
      files_fqdn: 'FQDN Distribution Publique (fichiers)',
      admin_fqdn: 'FQDN Administration (panel)',
      step2_title: '2. Sécurisation du compte',
      step2_desc: 'Modifiez le mot de passe initial généré pour sécuriser votre console.',
      new_password: 'Nouveau mot de passe administrateur',
      password_hint: 'Au moins 10 caractères, 1 majuscule, 1 minuscule, 1 chiffre.',
      step3_title: '3. Premier Modpack (Optionnel)',
      step3_desc: 'Créez votre premier endpoint pour recevoir vos fichiers de jeu.',
      modpack_name: 'Nom du modpack (ex: Create Adventures)',
      modpack_slug: 'Slug d’URL (ex: create-smp)',
      finish_btn: 'Terminer la configuration',
      skip_btn: 'Passer cette étape',
      done_title: 'PackPanel est prêt !',
      done_desc: 'Votre instance est configurée et protégée selon les normes de sécurité en vigueur.'
    },
    dashboard: {
      title: 'Tableau de bord',
      subtitle: 'Surveillance des endpoints, de l’inventaire CAS et des tâches d’ingestion',
      endpoints_count: 'Endpoints actifs',
      logical_files: 'Fichiers logiques',
      logical_storage: 'Volume logique',
      physical_storage: 'Stockage physique CAS',
      dedup_ratio: 'Taux de déduplication',
      active_jobs: 'Tâches en cours',
      quick_actions: 'Actions rapides',
      create_endpoint: 'Nouveau modpack',
      recent_releases: 'Dernières publications',
      no_releases: 'Aucune version publiée pour le moment',
      storage_health: 'Statut du stockage'
    },
    endpoints: {
      title: 'Endpoints de distribution',
      subtitle: 'Distribution de modpacks, gestion des versions immuables et règles de synchronisation',
      new_btn: 'Nouveau modpack',
      search: 'Filtrer par nom ou slug...',
      empty_title: 'Aucun endpoint créé',
      empty_desc: 'Créez votre premier endpoint pour commencer à distribuer des modpacks à vos joueurs.',
      badge_active: 'Version active',
      badge_draft: 'Brouillon (HTTP 404)',
      manifest_url: 'URL du Manifeste PackPanel',
      files_label: 'Fichiers',
      size_label: 'Taille',
      cleanup_label: 'Nettoyage',
      delete_title: 'Supprimer l’endpoint',
      delete_confirm: 'Êtes-vous certain de vouloir supprimer cet endpoint ? Toutes les versions publiées seront révoquées.'
    },
    users: {
      title: 'Utilisateurs & Journal d’audit',
      subtitle: 'Contrôle d’accès basé sur les rôles (RBAC) et traçabilité de toutes les actions',
      tab_users: 'Comptes utilisateurs',
      tab_audit: 'Journal d’audit',
      add_user: 'Ajouter un utilisateur',
      edit_user: 'Modifier l’utilisateur',
      username: 'Nom d’utilisateur',
      role: 'Rôle',
      last_login: 'Dernière connexion',
      created_at: 'Date de création',
      password: 'Mot de passe',
      leave_blank: 'Laisser vide pour ne pas modifier',
      delete_confirm: 'Supprimer définitivement cet utilisateur ? Ses sessions actives seront révoquées.',
      cannot_delete_self: 'Impossible de supprimer votre propre compte.',
      security_2fa: 'Sécurité 2FA',
      permissions: 'Permissions granulaires',
      permissions_desc: 'Droits d’accès spécifiques par endpoint',
      admin_bypass: 'Les administrateurs ont un accès total sans restriction.',
      can_write: 'Écriture (Upload & Édition)',
      can_publish: 'Publication de versions'
    },
    audit: {
      total: 'Événements enregistrés',
      action: 'Action',
      target: 'Cible',
      user: 'Utilisateur',
      ip: 'Adresse IP',
      date: 'Date & Heure',
      details: 'Données associées'
    }
  },
  en: {
    nav: {
      dashboard: 'Dashboard',
      endpoints: 'Modpacks & Endpoints',
      users: 'Users & Audit',
      jobs: 'Background Tasks',
      logout: 'Sign Out',
      role_admin: 'Administrator',
      role_operator: 'Operator',
      role_viewer: 'Viewer',
      language: 'Language'
    },
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create',
      loading: 'Loading...',
      success: 'Operation completed',
      error: 'An error occurred',
      confirm: 'Confirm',
      close: 'Close',
      back: 'Back',
      refresh: 'Refresh',
      copy: 'Copy',
      copied: 'Copied!',
      search: 'Search...',
      actions: 'Actions',
      status: 'Status',
      date: 'Date',
      version: 'Version',
      details: 'Details',
      yes: 'Yes',
      no: 'No',
      all: 'All'
    },
    setup: {
      badge: 'Initial Onboarding',
      title: 'Welcome to PackPanel',
      subtitle: 'Let’s configure your instance in a few quick steps before publishing modpacks.',
      step1_title: '1. Domains & Routing',
      step1_desc: 'Confirm your public distribution FQDN and admin console FQDN routed via Zoraxy / Cloudflare.',
      files_fqdn: 'Public Files FQDN (CDN)',
      admin_fqdn: 'Admin Console FQDN (Panel)',
      step2_title: '2. Admin Account Security',
      step2_desc: 'Replace the generated temporary password with your personal strong credentials.',
      new_password: 'New Administrator Password',
      password_hint: 'At least 10 characters: 1 uppercase, 1 lowercase, 1 digit.',
      step3_title: '3. First Modpack (Optional)',
      step3_desc: 'Set up your first endpoint to start ingesting game assets.',
      modpack_name: 'Modpack Name (e.g., Create Adventures)',
      modpack_slug: 'URL Slug (e.g., create-smp)',
      finish_btn: 'Complete Setup',
      skip_btn: 'Skip Setup',
      done_title: 'PackPanel is Ready!',
      done_desc: 'Your instance is configured and compliant with strict security standards.'
    },
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Monitor endpoints, Content-Addressed Storage, and active ingestion tasks',
      endpoints_count: 'Active Endpoints',
      logical_files: 'Logical Files',
      logical_storage: 'Logical Volume',
      physical_storage: 'Physical CAS Storage',
      dedup_ratio: 'Deduplication Ratio',
      active_jobs: 'Active Background Jobs',
      quick_actions: 'Quick Actions',
      create_endpoint: 'New Modpack',
      recent_releases: 'Recent Releases',
      no_releases: 'No published releases yet',
      storage_health: 'Storage Health'
    },
    endpoints: {
      title: 'Distribution Endpoints',
      subtitle: 'Modpack distribution, immutable version control, and client synchronization directives',
      new_btn: 'New Modpack',
      search: 'Filter by name or slug...',
      empty_title: 'No endpoints found',
      empty_desc: 'Create your first endpoint to begin distributing modpacks to your players.',
      badge_active: 'Active Version',
      badge_draft: 'Draft (HTTP 404)',
      manifest_url: 'PackPanel Manifest URL',
      files_label: 'Files',
      size_label: 'Size',
      cleanup_label: 'Cleanup Rules',
      delete_title: 'Delete Endpoint',
      delete_confirm: 'Are you sure you want to delete this endpoint? All published versions will be revoked.'
    },
    users: {
      title: 'Users & Audit Logs',
      subtitle: 'Role-Based Access Control (RBAC) and immutable operational audit trail',
      tab_users: 'User Accounts',
      tab_audit: 'Audit Log',
      add_user: 'Add User',
      edit_user: 'Edit User',
      username: 'Username',
      role: 'Role',
      last_login: 'Last Sign In',
      created_at: 'Created Date',
      password: 'Password',
      leave_blank: 'Leave empty to keep current password',
      delete_confirm: 'Permanently delete this user? Active sessions will be terminated immediately.',
      cannot_delete_self: 'You cannot delete your own account.',
      security_2fa: '2FA Security',
      permissions: 'Granular Permissions',
      permissions_desc: 'Endpoint-specific access control',
      admin_bypass: 'Administrators have full unrestricted access to all endpoints.',
      can_write: 'Write (Upload & Edit)',
      can_publish: 'Publish releases'
    },
    audit: {
      total: 'Logged Events',
      action: 'Action',
      target: 'Target',
      user: 'User',
      ip: 'IP Address',
      date: 'Date & Time',
      details: 'Payload Details'
    }
  }
};

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string) => string;
  tr: (source: string, values?: Values) => string;
}

const I18nContext = createContext<I18nContextType>({
  language: 'fr',
  setLanguage: () => {},
  t: (path) => path,
  tr: (source) => source
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(selectedLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === 'fr' ? 'PackPanel — Administration des modpacks' : 'PackPanel — Modpack administration';
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('packpanel_lang', lang);
  };

  const t = (path: string): string => {
    const parts = path.split('.');
    let current: any = translations[language];
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        // Fallback to French if key missing in target language
        let fallback: any = translations['fr'];
        for (const fbPart of parts) {
          if (fallback && typeof fallback === 'object' && fbPart in fallback) {
            fallback = fallback[fbPart];
          } else {
            return path;
          }
        }
        return typeof fallback === 'string' ? fallback : path;
      }
    }
    return typeof current === 'string' ? current : path;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, tr: (source, values) => translateMessage(source, language, values) }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = () => useContext(I18nContext);
