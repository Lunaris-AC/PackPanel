# Documentation PackPanel

Le point d’entrée d’installation et de développement est le [README principal](../README.md).
La version du 4 octobre 2026 utilise Node.js 24, Fastify 5, PostgreSQL 16,
React/Vite et un launcher Electron autonome dédié à chaque instance.
Le client propose français/anglais, pseudo offline, Jouer et Paramètres.

- [Guide utilisateur](USER_GUIDE.md)
- [Exploitation, sauvegardes et restauration](OPERATIONS.md)
- [Sécurité et permissions](SECURITY.md)
- [Architecture](ARCHITECTURE.md)
- [Tests réellement effectués et limites](TEST_REPORT.md)
- [Déploiement sur le serveur](DEPLOYMENT_REPORT.md)
- [Reverse proxy Zoraxy et Cloudflare](ZORAXY_CLOUDFLARE.md)
- [API et SDK](API_SDK_REFERENCE.md)

La validation actuelle concerne Windows x64 en mode offline. L’intégration
Microsoft et la validation des clients Linux/macOS restent des travaux futurs.
