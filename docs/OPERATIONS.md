# Manuel d'Exploitation & Maintenance - PackPanel

Ce guide fournit les procédures opérationnelles pour superviser, sauvegarder, restaurer et maintenir une instance **PackPanel** en production.

---

## 1. Commandes d'Exploitation Usuelles

Toutes les commandes s'exécutent depuis le répertoire racine `/opt/packpanel` :

```bash
# Vérifier l'état des services
docker compose ps

# Consulter les journaux en direct de tous les services
docker compose logs -f

# Consulter spécifiquement les journaux du worker de fond
docker compose logs -f worker

# Consulter spécifiquement les requêtes de l'API
docker compose logs -f api

# Redémarrer l'ensemble des conteneurs
docker compose restart

# Arrêter proprement l'application
docker compose down
```

---

## 2. Sauvegardes & Restauration

### 2.1 Sauvegarde Complète Automatisée
Le script `/opt/packpanel/scripts/backup.sh` génère une archive compressée autonome contenant :
1. Un export complet de la base de données PostgreSQL (`pg_dump`).
2. Tous les objets physiques dédoublonnés du CAS (`/srv/packpanel/storage/objects`).

Pour exécuter une sauvegarde manuelle :
```bash
/opt/packpanel/scripts/backup.sh
```
Les archives sont stockées dans `/srv/packpanel/backups/packpanel_backup_<date>.tar.gz`. Le script applique automatiquement une rétention pour conserver les 10 sauvegardes les plus récentes.

### 2.2 Automatisation via Cron (Recommandé)
Pour planifier une sauvegarde quotidienne à 3h00 du matin, ajoutez cette ligne au crontab racine (`crontab -e`) :
```cron
0 3 * * * /opt/packpanel/scripts/backup.sh > /srv/packpanel/backups/backup.log 2>&1
```

### 2.3 Procédure de Restauration (*Disaster Recovery*)
En cas de défaillance matérielle ou de corruption de données :
```bash
/opt/packpanel/scripts/restore.sh /srv/packpanel/backups/packpanel_backup_YYYYMMDD_HHMMSS.tar.gz
```
Le script termine proprement les connexions actives vers la base de données, purge la base, réimporte le schéma et restaure l'ensemble des objets CAS.
Pour une exécution automatisée ou non-interactive (CI/CD) :
```bash
/opt/packpanel/scripts/restore.sh -y /srv/packpanel/backups/packpanel_backup_YYYYMMDD_HHMMSS.tar.gz
```

---

## 3. Ingestion par Dossier Surveillé (*Watched Folder*)

Pour automatiser la publication depuis vos pipelines CI/CD ou scripts externes sans passer par l'interface web :

1. Déposez l'arborescence des fichiers dans le dossier entrant de l'endpoint :
   `/srv/packpanel/storage/uploads/incoming/<slug>/`
2. Une fois le transfert de tous les fichiers totalement achevé, déposez un fichier marqueur nommé `.ready` à la racine de ce dossier :
   ```bash
   touch /srv/packpanel/storage/uploads/incoming/<slug>/.ready
   ```
3. Le worker en arrière-plan détecte le marqueur, ingère l'arborescence, calcule les empreintes SHA-1 et SHA-256 dans le CAS, publie la nouvelle version atomique et supprime le dossier entrant.

---

## 4. Politique de Rétention & Ramasse-Miettes (GC)

### 4.1 Rétention des Versions
Chaque endpoint est configuré avec deux paramètres :
- `default_retention_days` (défaut : 14 jours) : Durée minimale pendant laquelle une version archivée est conservée.
- `min_retained_versions` (défaut : 5 versions) : Nombre minimal de versions historiques toujours conservées, même si leur date dépasse la durée de rétention.
- **Protection par Épinglage (*Pin*)** : Une version marquée comme épinglée dans le panel ou via l'API ne sera **jamais purgée** par le ramasse-miettes.

### 4.2 Nettoyage des Objets Orphelins (*GC CAS*)
Le worker exécute périodiquement la tâche `gc_orphan_objects` :
- Il identifie les objets dans `/srv/packpanel/storage/objects/` qui ne sont plus référencés par aucune version active ou archivée.
- Il supprime les fichiers correspondants et libère l'espace disque physique.

---

## 5. Dépannage & Diagnostic

| Symptôme | Cause Probable | Solution |
| :--- | :--- | :--- |
| **API retourne HTTP 502 Bad Gateway sur 8080** | Le conteneur Fastify est en cours de démarrage ou arrêté | `docker compose logs api` pour analyser l'erreur |
| **Le launcher reçoit 404 sur `index.php`** | L'endpoint n'a pas encore publié sa première version | Publier une version depuis l'onglet Téléversement |
| **Fichiers bloqués dans la file d'attente** | Le worker a été interrompu lors d'un calcul lourd | Le mécanisme de heartbeat libère les tâches après 2 minutes. Vérifier `docker compose logs worker` |
| **Erreur de quota disque** | Le quota de l'endpoint ou l'espace disque de `/srv` est saturé | Vérifier l'espace libre avec `df -h /srv/packpanel` |
