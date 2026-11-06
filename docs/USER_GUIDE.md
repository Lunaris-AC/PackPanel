# Guide utilisateur

## Créer et publier une instance

1. Dans **Instances Minecraft**, ouvrez **Nouvelle instance**.
2. Choisissez un nom, une version Minecraft et Vanilla, Fabric, Forge, NeoForge
   ou Quilt. Le catalogue officiel détermine les versions compatibles et Java
   requis ; une erreur de catalogue est affichée séparément.
3. Déposez vos mods et configurations dans **Fichiers & Mods**. Les ajouts,
   modifications et suppressions sont visibles dans le brouillon de l’instance.
   Utilisez **Importer un ZIP** pour un pack complet ou des fichiers volumineux.
4. Cliquez sur **Publier la première version** ou **Publier les modifications**
   pour distribuer les fichiers et les paramètres de jeu. L’onglet
   **Publications & Rollback** distingue le brouillon de la version active.
   Vous pouvez écrire des notes de version visibles sur la page joueur et
   dans le launcher.

L’adresse de connexion directe est facultative. Pour tester l’écran de démarrage
sans serveur, laissez-la vide. Une instance Minecraft décrit un jeu et son pack ;
PackPanel n’héberge pas le serveur Minecraft lui-même.

## Générer le launcher

Depuis la page de l’instance, ouvrez l’onglet **Launcher**, activez le launcher,
puis configurez son titre, ses images, sa couleur et ses liens communautaires.
Le client est dédié à cette instance : il ne présente pas de liste d’instances
aux joueurs. Le mode actuel utilise un pseudo offline ; Microsoft sera ajouté
et validé ultérieurement.

Publiez l’instance et enregistrez les réglages du launcher. Pour Windows 64 bits,
cliquez sur **Générer l’installateur Windows**. Les autres formats restent
disponibles dans le sélecteur. La tâche continue en arrière-plan. Quand son
statut indique **Prêt**, vous pouvez télécharger le fichier dans l’historique.

Pour donner aux joueurs un lien sans compte administrateur, cliquez sur
**Partager** dans l’historique, puis sur **Copier le lien** dans la section
**Page de téléchargement des joueurs**. Un nouveau fichier partagé remplace
celui de la même plateforme. **Retirer le partage** désactive son lien de
téléchargement.

Générez un nouveau fichier après un changement d’apparence. Les launchers déjà
distribués récupèrent les modifications du pack à la prochaine ouverture du jeu,
après publication.

## Jouer

Sous Windows, ouvrez l’installateur `.exe` téléchargé et suivez l’assistant.
L’installation se fait dans votre compte Windows sans droits administrateur.
Le launcher est accessible dans le dossier **PackPanel** du menu Démarrer.
Vous pouvez le retirer depuis **Paramètres → Applications**. Vos données de jeu
et réglages sont conservés.

Si vous avez téléchargé le ZIP Windows portable, extrayez-le en entier et
ouvrez `windows/electron.exe`. Le runtime Electron est inclus dans les deux
formats. Node.js n’est pas requis sur le poste du joueur.
Une connexion Internet est nécessaire pour récupérer le pack, Minecraft, ses
bibliothèques et Java si la version requise manque.

Les installations Windows récentes vérifient aussi la version du programme
PackPanel. Quand **Redémarrer et mettre à jour** apparaît, fermez Minecraft
puis utilisez ce bouton. Le launcher conserve sa configuration et votre
profil de jeu. Pour activer cette fonction sur un ancien launcher, installez
une fois le dernier `.exe` de votre page joueur.

Saisissez un pseudo de 3 à 16 caractères (lettres, chiffres et tiret bas), puis
cliquez sur **Jouer / Play**. Avant chaque lancement, le client vérifie le manifeste
et met à jour les fichiers du pack. Les sauvegardes, captures d’écran et options
personnelles sont protégées.

Dans **Votre pack**, vous pouvez comparer la version installée à la dernière
version publiée, préparer une mise à jour ou vérifier les fichiers sans
démarrer le jeu. Si l’instance propose des fichiers facultatifs, cochez ceux
que vous voulez installer avant de préparer ou de lancer le pack.

Le sélecteur **FR / EN** dans la barre de titre change immédiatement la langue
et mémorise le choix. Cette barre permet aussi de déplacer, réduire, agrandir,
restaurer et fermer la fenêtre.

En cas de problème, ouvrez **Journal du jeu** dans **Paramètres**. Le dernier
diagnostic reste disponible après la fermeture du launcher. Le bouton **Copier
le diagnostic** le place dans le presse-papiers.

## Paramètres du joueur

- **Mémoire du jeu** : choisissez la RAM avec le curseur ou le champ en Mo/MB.
  4096 Mo correspondent à 4 Go. L’allocation choisie remplace les arguments
  `-Xms` / `-Xmx` du pack pour éviter les réglages contradictoires.
- **Arguments JVM supplémentaires** : ils s’ajoutent à ceux de l’instance.
  Exemple : `-Dfile.encoding=UTF-8`. Les valeurs contenant des espaces peuvent
  être entourées de guillemets.
- **Les fichiers de votre jeu** : ouvre le dossier de cette instance dans
  l’explorateur de Windows.
- **Journal du jeu** : affiche les messages de Minecraft pour diagnostiquer
  un problème de lancement.

Cliquez sur **Enregistrer / Save settings** pour conserver les réglages.
Les [résultats de validation](TEST_REPORT.md) précisent les systèmes et versions
réellement testés.
