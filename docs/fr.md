# Twitch

Suivez des chaînes Twitch dans Gladys : sachez qui est en direct, dans quelle
catégorie et devant combien de spectateurs, lancez des scènes quand un live
commence ou se termine, et affichez les chaînes sur un tableau de bord.

L'intégration ne lit que des données **publiques**. Aucun compte Twitch n'est
lié : elle utilise les identifiants d'une application Twitch gratuite que vous
créez une fois.

## 1. Créer une application Twitch

1. Allez sur la [console développeur Twitch](https://dev.twitch.tv/console/apps/create)
   et connectez-vous avec n'importe quel compte Twitch (l'authentification à
   deux facteurs doit être activée).
2. Remplissez le formulaire :
   - **Nom** : un nom unique, par exemple `Gladys ma-maison` ;
   - **OAuth Redirect URLs** : `http://localhost` (inutilisée, mais
     obligatoire) ;
   - **Catégorie** : `Other` ;
   - **Type de client** : `Confidentiel`.
3. Cliquez sur **Créer**, puis sur **Gérer** sur la nouvelle application.
4. Copiez le **Client ID**, puis cliquez sur **Nouveau secret** et copiez le
   **Client Secret** (il n'est affiché qu'une fois).

## 2. Configurer l'intégration

1. Ouvrez l'onglet **Configuration** de l'intégration dans Gladys.
2. Collez le **Client ID** et le **Client Secret**.
3. Dans **Chaînes**, listez les chaînes à suivre, séparées par des virgules.
   Les noms (`twitchdev`), les `@noms` et les liens
   (`https://www.twitch.tv/twitchdev`) sont acceptés, jusqu'à 100 chaînes.
4. Modifiez si besoin l'**Intervalle de rafraîchissement** : Twitch est lu
   toutes les 60 secondes par défaut (de 30 secondes à une heure).
5. Enregistrez, puis cliquez sur **Tester la connexion** : la réponse indique
   combien de chaînes ont été trouvées, combien sont en direct et quels noms
   n'existent pas sur Twitch.
6. Ouvrez l'onglet **Découverte** et ajoutez les chaînes voulues comme
   appareils.

## Ce que vous obtenez

Un appareil par chaîne, nommé `Twitch <chaîne>`, avec :

| Fonctionnalité | Valeur                                                       |
| -------------- | ------------------------------------------------------------ |
| Live           | 1 quand la chaîne est en direct, 0 sinon                     |
| Viewers        | Nombre de spectateurs actuel                                 |
| Uptime         | Minutes depuis le début du live                              |
| Title          | Titre du live (le dernier quand la chaîne est hors ligne)    |
| Category       | Jeu ou catégorie (le dernier quand la chaîne est hors ligne) |

L'appareil est lié à l'**identifiant utilisateur** Twitch de la chaîne : un
streamer qui renomme sa chaîne garde le même appareil, son historique et ses
scènes.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes (Gladys 5.1 ou
plus récent).

Déclencheurs :

- **Live Twitch commencé** — une chaîne suivie passe en direct. Choisissez
  si besoin la chaîne et une catégorie (nom exact, par exemple
  `Just Chatting`). Variables : `{{triggerEvent.data.channel_name}}`, `title`,
  `game` et `url`.
- **Live Twitch terminé** — une chaîne suivie arrête son direct. Variable :
  `duration_minutes`, la durée du live.
- **Catégorie Twitch changée** — une chaîne en direct passe à un autre jeu.
  Variables : `game`, `previous_game`, `title`.

Actions :

- **Vérifier une chaîne Twitch** — n'importe quelle chaîne publique (suivie
  ou non) est-elle en direct ? Renvoie `is_live`, `channel_name`,
  `viewer_count`, `title`, `game` et `uptime_minutes`, utilisables par les
  actions suivantes.
- **Rafraîchir les chaînes Twitch** — lit les chaînes suivies tout de suite,
  sans attendre le prochain rafraîchissement, et renvoie `live_count`.

Vous pouvez aussi utiliser le déclencheur et la condition standard **état
d'un appareil** sur les fonctionnalités **Live** ou **Viewers** (« quand plus
de 100 spectateurs… »).

Exemple : _quand un live commence sur ma chaîne préférée, m'envoyer le
message « {{triggerEvent.data.channel_name}} est en direct :
{{triggerEvent.data.title}} {{triggerEvent.data.url}} »_.

## Tableau de bord

Ajoutez le widget **Chaînes Twitch** à un tableau de bord. Il affiche le
nombre de chaînes en direct, puis une ligne par chaîne : avatar, badge
« en direct », catégorie et spectateurs. Touchez une ligne pour voir le titre
du live et un lien vers la chaîne. Le bouton **Rafraîchir** lit Twitch
immédiatement.

Réglages du widget : choisissez les chaînes affichées (toutes si vide) et/ou
seulement celles en direct.

## Bon à savoir

- Un live n'est déclaré terminé qu'après deux réponses Twitch de suite sans
  lui : Twitch oublie parfois un live le temps d'une requête, et les scènes
  annonceraient sinon une fin de live puis un nouveau début une minute plus
  tard.
- Une chaîne ajoutée à la liste alors qu'elle est déjà en direct ne
  déclenche pas **Live Twitch commencé** : son live ne vient pas de commencer.
- L'intégration garde le dernier état de chaque chaîne dans son volume de
  données : après un redémarrage, un live déjà en cours n'est pas annoncé de
  nouveau, et un live commencé entre-temps l'est.

## Dépannage

- **« Twitch a refusé le Client ID ou le Client Secret »** : recopiez-les
  depuis la console développeur. Un nouveau secret invalide le précédent.
- **Une chaîne est « introuvable sur Twitch »** : vérifiez son orthographe
  dans l'adresse de la chaîne.
- Le badge de l'appareil indique **cloud** quand Twitch répond,
  **injoignable** sinon. Consultez les logs de l'intégration depuis
  l'interface de Gladys pour le détail.
