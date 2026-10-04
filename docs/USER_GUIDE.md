# Guide utilisateur

## Créer et publier une instance

1. Dans **Instances Minecraft**, ouvrez **Nouvelle instance**.
2. Choisissez un nom, une version Minecraft et Vanilla, Fabric, Forge, NeoForge
   ou Quilt. Le catalogue officiel détermine les versions compatibles et Java
   requis ; une erreur de catalogue est affichée séparément.
3. Déposez vos mods et configurations dans l’explorateur. Attendez la fin du
   traitement des fichiers avant de publier. Les uploads directs, TUS et ZIP
   passent par le worker et le calcul d’intégrité.
4. Cliquez sur **Publier**. Les fichiers préparés en brouillon deviennent alors
   disponibles dans la version publique. Enregistrer un fichier sans publication
   immédiate prépare un brouillon.

L’adresse de connexion directe est facultative. Pour tester l’écran de démarrage
sans serveur, laissez-la vide. Une instance Minecraft décrit un jeu et son pack ;
PackPanel n’héberge pas le serveur Minecraft lui-même.

## Générer le launcher

Depuis la page de l’instance, ouvrez l’onglet **Launcher**, activez le launcher,
puis configurez son titre, ses images, sa couleur et ses liens communautaires.
Le client est dédié à cette instance : il ne présente pas de liste d’instances
aux joueurs. Le mode actuel utilise un pseudo offline ; Microsoft sera ajouté
et validé ultérieurement.

Choisissez Windows puis **Générer le launcher**. Utilisez **Télécharger** dans
l’historique pour récupérer le ZIP autonome. Distribuez ce ZIP complet aux
joueurs. Après une modification de l’apparence du launcher, générez un nouveau
ZIP ; les mises à jour des mods et configurations passent par **Publier** et
sont récupérées par les launchers déjà distribués.

## Jouer

Extrayez tout le ZIP dans un dossier puis ouvrez `windows/run-launcher.bat`.
Le runtime Electron est inclus : Node.js n’est pas requis sur le poste du joueur.
Une connexion Internet est nécessaire pour récupérer le pack, Minecraft, ses
bibliothèques et Java si la version requise manque.

Saisissez un pseudo de 3 à 16 caractères (lettres, chiffres et tiret bas), puis
cliquez sur **Jouer / Play**. Avant chaque lancement, le client vérifie le manifeste
et met à jour les fichiers du pack. Les sauvegardes, captures d’écran et options
personnelles sont protégées.

Le sélecteur **FR / EN** dans la barre de titre change immédiatement la langue
et mémorise le choix. Cette barre permet aussi de déplacer, réduire, agrandir,
restaurer et fermer la fenêtre.

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
