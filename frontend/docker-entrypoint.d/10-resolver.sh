#!/bin/sh
# ════════════════════════════════════════════════════════════════════════════
# Injecte le serveur DNS du moteur de conteneurs dans la conf nginx
# ════════════════════════════════════════════════════════════════════════════
#
# nginx.conf déclare `resolver RIDELOG_RESOLVER`. Ce script remplace ce
# marqueur par l'adresse réellement utilisée par le conteneur, lue dans
# /etc/resolv.conf.
#
# Pourquoi ne pas écrire l'adresse en dur : elle dépend du moteur.
#   Docker  → 127.0.0.11 (resolveur embarqué, sur la loopback du conteneur)
#   Podman  → l'adresse de la passerelle du réseau (aardvark-dns), ex 10.89.0.1
# Figer l'une des deux rendrait l'API inaccessible sous l'autre.
#
# Exécuté automatiquement par l'entrypoint de l'image nginx officielle, qui
# lance tout /docker-entrypoint.d/*.sh avant de démarrer nginx.
# ════════════════════════════════════════════════════════════════════════════

set -e

CONF=/etc/nginx/conf.d/default.conf

# Déjà substitué (conteneur redémarré sans être recréé) : rien à faire.
grep -q 'RIDELOG_RESOLVER' "$CONF" || exit 0

# Premier `nameserver` déclaré ; c'est celui que le conteneur interroge.
RESOLVER=$(awk '/^[[:space:]]*nameserver/ { print $2; exit }' /etc/resolv.conf 2>/dev/null || true)

if [ -z "$RESOLVER" ]; then
    # Aucun nameserver lisible : on retombe sur le resolveur Docker, cas de
    # loin le plus courant. Si c'est faux, l'erreur sera explicite dans les
    # logs nginx ("could not be resolved") plutôt que silencieuse.
    RESOLVER=127.0.0.11
    echo "RideLog: aucun nameserver dans /etc/resolv.conf, repli sur $RESOLVER"
fi

# La directive resolver exige des crochets autour d'une adresse IPv6.
case "$RESOLVER" in
    *:*) RESOLVER="[$RESOLVER]" ;;
esac

sed -i "s|RIDELOG_RESOLVER|$RESOLVER|" "$CONF"
echo "RideLog: resolver nginx → $RESOLVER"
