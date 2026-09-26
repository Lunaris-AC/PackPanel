# Guide de Configuration : Zoraxy & Cloudflare - PackPanel

Ce document détaille la configuration recommandée du reverse proxy **Zoraxy** (`192.168.1.173`) et du CDN **Cloudflare** pour router et sécuriser le trafic vers votre instance **PackPanel** (`192.168.1.171`).

---

## 1. Configuration de Zoraxy (Reverse Proxy Local)

Dans l'interface d'administration de votre Zoraxy (`http://192.168.1.173:8000`) :

### Règle 1 : Panel d'Administration (`ADMIN_FQDN`)
- **Nom de la règle** : `PackPanel - Administration`
- **Root Domain / Subdomain** : `panel.mccdn.internal` *(ou votre domaine d'administration public)*
- **Cible de redirection (Forward Target)** : `http://192.168.1.171:8080`
- **Paramètres Avancés** :
  - **WebSocket / SSE Support** : Activé *(indispensable pour le flux d'événements temps réel `/api/events`)*
  - **Buffering / Tampon de réponse** : Désactivé *(permet l'affichage progressif du statut des tâches et le flux SSE sans latence)*
  - **Limite de taille du corps (Max Body Size)** : 0 *(illimité, ou minimum 2048 Mo pour les archives ZIP volumineuses)*
  - **Timeouts** :
    - Read Timeout : `600s` *(pour les téléversements longs)*
    - Send Timeout : `600s`

---

### Règle 2 : Distribution Publique MineLaunched (`FILES_FQDN`)
- **Nom de la règle** : `PackPanel - Fichiers Publics`
- **Root Domain / Subdomain** : `mccdn.internal` *(ou votre domaine public de distribution)*
- **Cible de redirection (Forward Target)** : `http://192.168.1.171:8081`
- **Paramètres Avancés** :
  - **HTTP/2 & Keep-Alive** : Activé *(accélère considérablement le téléchargement multi-fichiers par le launcher)*
  - **Gzip / Compression** : Laisser Nginx gérer ou activer dans Zoraxy
  - **En-têtes Proxy** :
    - `Host: $host`
    - `X-Real-IP: $remote_addr`
    - `X-Forwarded-For: $proxy_add_x_forwarded_for`
    - `X-Forwarded-Proto: https`

---

## 2. Configuration Cloudflare (DNS & Edge CDN)

Si vos endpoints sont distribués sur Internet via Cloudflare :

### 2.1 Enregistrements DNS
- `A` ou `CNAME` pour votre domaine d'administration : Proxy Cloudflare désactivé (Gris / DNS Only) ou avec règle d'exception pour TUS.
- `A` ou `CNAME` pour votre domaine de distribution : Proxy Cloudflare activé (Orange / Proxied).

---

### 2.2 Règles de Cache Cloudflare (*Cache Rules*)

Une mauvaise configuration du cache peut empêcher les joueurs de recevoir instantanément vos mises à jour ou surcharger votre serveur en bande passante. Appliquez ces deux règles dans l'onglet **Caching > Cache Rules** :

#### Règle A : Contournement du Cache pour les Manifestes (`Bypass Manifest Cache`)
- **Condition (If incoming request matches)** :
  `URI Path ends with "/index.php"`
- **Action (Cache eligibility)** :
  - **Bypass cache** *(Ne pas mettre en cache)*
- **Justification** : Le fichier `index.php` reflète la version active courante. Il doit être délivré en temps réel sans aucun délai de cache pour que les joueurs détectent immédiatement la nouvelle version dès sa publication.

---

#### Règle B : Cache Agressif pour les Fichiers de Releases (`Cache Releases Everything`)
- **Condition (If incoming request matches)** :
  `URI Path contains "/releases/"`
- **Action (Cache eligibility)** :
  - **Eligible for cache**
  - **Edge Cache TTL** : `1 month` *(ou Respect origin)*
  - **Browser Cache TTL** : `1 month`
- **Justification** : Les releases PackPanel sont **strictement immuables**. Le contenu d'un fichier sous `releases/r0001/...` ne changera jamais (une modification produit une version `r0002`). Ce cache absorbe 99% de la bande passante lors des connexions simultanées de dizaines de joueurs.

---

### 2.3 Règle de Sécurité WAF (Contournement Challenge JS pour MineLaunched)

Le launcher MineLaunched est un client Java léger : il ne peut pas résoudre les défis JavaScript Cloudflare (*Under Attack Mode* ou *Managed Challenge*).

Dans **Security > WAF > Custom Rules** :
- **Condition** :
  `(http.host eq "votre-domaine-fichiers.com" and (http.request.uri.path contains "/index.php" or http.request.uri.path contains "/releases/"))`
- **Action** :
  - **Skip** :
    - WAF Managed Rules
    - Rate Limiting
    - Browser Integrity Check
- **Justification** : Permet au client de jeu de télécharger librement les fichiers du modpack sans être bloqué par un captcha Cloudflare.
