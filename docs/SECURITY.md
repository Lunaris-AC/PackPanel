# Sécurité et permissions

## Administration

Les mots de passe sont hachés avec Argon2id. Les sessions utilisent un identifiant
et un jeton aléatoire dont seule l’empreinte est conservée en base. Les entrées
malformées sont rejetées. Les changements de mot de passe révoquent les autres
sessions du compte.

L’API accepte un cookie HttpOnly/SameSite ainsi qu’un jeton Bearer. Le panel
conserve aussi ce jeton dans localStorage : le cookie ne constitue donc pas,
à lui seul, une protection contre un script exécuté dans le panel. Utilisez
HTTPS pour l’administration exposée sur Internet ; les cookies Secure de
production ne sont pas disponibles lors des tests LAN en HTTP.

Les requêtes mutantes avec une origine ou un referer non autorisé sont refusées.
Les clients API authentifiés peuvent envoyer des requêtes sans ces en-têtes.
La configuration des domaines est persistée par une route réservée à
l’administrateur. La distribution publique sur le port 8081 expose des fichiers
statiques et bloque les routes d’administration/API.

## Rôles

- **Lecteur** : consultation, sans modification ni publication.
- **Opérateur** : les modifications d’une instance ou de ses fichiers exigent
  `can_write` sur son endpoint ; publication, rollback et promotion exigent
  `can_publish`. La promotion vérifie aussi les droits sur la cible.
- **Administrateur** : gestion des utilisateurs, configuration système et
  annulation des tâches, avec accès complet aux endpoints.

Les permissions sont vérifiées côté serveur, y compris pour les publications
immédiates depuis l’éditeur et les uploads TUS. Les tests réels couvrent les
refus lecteur/opérateur, les droits d’écriture sans publication et les variantes
d’URL avec une chaîne de requête.

## Fichiers et client

Les uploads sont associés à une session ouverte appartenant au bon utilisateur
et endpoint. Les chemins sont normalisés et validés ; l’extraction ZIP limite
le nombre de fichiers et le volume extrait. Les objets sont hachés avant
publication. Les versions publiées utilisent des fichiers CAS et des manifestes
dont les adresses correspondent à l’endpoint cible.

Le moteur du launcher valide les chemins, refuse les sorties du dossier de jeu
et les liens symboliques dangereux, vérifie les téléchargements et conserve
l’ancien fichier si un transfert est corrompu. Les dossiers et fichiers
personnels obligatoirement protégés restent protégés même si le manifeste
omet cette règle. Le ramasse-miettes prend en compte les versions, uploads,
historiques et références aux images avant de supprimer un objet.

Le renderer Electron utilise contextIsolation, sandbox et aucune intégration
Node.js. Son accès passe par des opérations IPC limitées ; ouvrir les fichiers
du jeu ouvre uniquement le dossier de l’instance embarquée. La navigation et
les liens externes sont limités aux liens web prévus.

Les scripts de sauvegarde stockent base, fichiers, builds et environnement dans
des archives privées. Les secrets, mots de passe et sessions de validation
ne doivent pas être consignés dans les documents du dépôt.

Ces contrôles décrivent l’implémentation et la [validation effectuée](TEST_REPORT.md).
Le mode joueur validé est offline ; il ne fournit pas une identité Microsoft.
