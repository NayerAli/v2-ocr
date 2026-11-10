#!/usr/bin/env bash
# Sauvegarde de l'ancien Supabase auto-hébergé, à lancer SUR LE SERVEUR (par le prestataire).
#
# Produit dans le dossier de sortie :
#   base.dump              pg_dump -Fc -Z 9 (schémas public, auth, storage ; cohérence par snapshot)
#   fichiers-storage.tar.gz  contenu du stockage des fichiers (tar + gzip -9)
#   rapport.txt            tailles comparées (dump / pg_database_size), contrôles, avertissements
#   SHA256SUMS             empreintes des deux archives
#
# Lecture seule : la base et le stockage source ne sont jamais modifiés.
# Le script s'arrête au premier échec ; un fichier incomplet n'est jamais gardé.
#
# Configuration (variables d'environnement, toutes facultatives sauf indication) :
#   OCR_CONTENEUR_DB       conteneur de la base, ex. supabase-db. Vide = pg_dump lancé sur cette machine
#                          (utilise PGHOST, PGPORT, PGPASSWORD si nécessaires).
#   OCR_PG_USER            utilisateur PostgreSQL (défaut : supabase_admin)
#   OCR_PG_BASE            base à sauvegarder (défaut : postgres)
#   OCR_SCHEMAS            schémas inclus, séparés par des espaces (défaut : "public auth storage")
#   OCR_CONTENEUR_STORAGE  conteneur du stockage, ex. supabase-storage. Vide = dossier local OCR_STORAGE_CHEMIN.
#   OCR_STORAGE_CHEMIN     dossier des fichiers (défaut : /var/lib/storage)
#   OCR_SORTIE             dossier de sortie (défaut : ./sauvegarde-supabase-AAAAMMJJ-HHMMSS)
#
# Exemple (Supabase self-hosted standard) :
#   OCR_CONTENEUR_DB=supabase-db OCR_CONTENEUR_STORAGE=supabase-storage \
#     bash sauvegarde-supabase.sh
set -euo pipefail

PG_USER=${OCR_PG_USER:-supabase_admin}
PG_BASE=${OCR_PG_BASE:-postgres}
SCHEMAS=${OCR_SCHEMAS:-public auth storage}
STOCKAGE_CHEMIN=${OCR_STORAGE_CHEMIN:-/var/lib/storage}
SORTIE=${OCR_SORTIE:-./sauvegarde-supabase-$(date +%Y%m%d-%H%M%S)}
CONTENEUR_DB=${OCR_CONTENEUR_DB:-}
CONTENEUR_STORAGE=${OCR_CONTENEUR_STORAGE:-}

# Schémas système ou propres à Supabase, exclus de la sauvegarde (même liste que archive.mjs).
SCHEMAS_SYSTEME="information_schema public auth storage extensions graphql graphql_public realtime _realtime net pgsodium pgsodium_masks vault supabase_functions supabase_migrations _analytics _supavisor pgbouncer pgmq cron topology tiger tiger_data"

if [ -n "$CONTENEUR_DB$CONTENEUR_STORAGE" ]; then
  command -v docker >/dev/null || { echo "docker introuvable sur cette machine" >&2; exit 1; }
fi
mkdir -p "$SORTIE"
RAPPORT="$SORTIE/rapport.txt"
: > "$RAPPORT"
log() { printf '%s\n' "$*" | tee -a "$RAPPORT"; }
octets() { numfmt --to=iec-i --suffix=B "$1" 2>/dev/null || echo "$1 o"; }

# Exécute une commande PostgreSQL (pg_dump, psql, pg_restore) dans le conteneur de la base, ou localement.
# L'entrée et la sortie standard restent branchées (dump binaire compris).
db() {
  if [ -n "$CONTENEUR_DB" ]; then docker exec -i -e PGPASSWORD "$CONTENEUR_DB" "$@"
  else "$@"; fi
}
# Lit le dossier des fichiers Storage (conteneur ou machine) et le sort en tar non compressé.
stockage() {
  if [ -n "$CONTENEUR_STORAGE" ]; then docker exec -i "$CONTENEUR_STORAGE" tar -C "$STOCKAGE_CHEMIN" -cf - .
  else tar -C "$STOCKAGE_CHEMIN" -cf - .; fi
}

# Un fichier partiel est supprimé en cas d'échec, pour qu'il ne soit jamais pris pour une sauvegarde.
PARTIELS=()
nettoyer() { for f in "${PARTIELS[@]}"; do rm -f "$f"; done; }
trap 'nettoyer; echo "Échec de la sauvegarde. Rien de partiel n est conservé." >&2' ERR

log "Sauvegarde Supabase du $(date '+%Y-%m-%d %H:%M:%S')"
log "Base : $PG_BASE (utilisateur $PG_USER, $([ -n "$CONTENEUR_DB" ] && echo "conteneur $CONTENEUR_DB" || echo "cette machine"))"
log "Schémas : $SCHEMAS"
log ""

# 1. Contrôles avant la copie
for s in $SCHEMAS_SYSTEME; do :; done
autres=$(db psql -U "$PG_USER" -d "$PG_BASE" -At -v ON_ERROR_STOP=1 -c "
  select string_agg(n.nspname, ' ') from pg_namespace n
  where n.nspname not like 'pg\_%' and n.nspname <> all (string_to_array('$SCHEMAS_SYSTEME $SCHEMAS', ' '))
    and exists (select 1 from pg_class c where c.relnamespace = n.oid)")
if [ -n "$autres" ]; then
  log "AVERTISSEMENT : des schémas utilisateur ne sont PAS inclus et doivent être examinés : $autres"
fi
taille_base=$(db psql -U "$PG_USER" -d "$PG_BASE" -At -c "select pg_database_size(current_database())")
log "Taille de la base (pg_database_size) : $(octets "$taille_base") ($taille_base octets)"

# 2. Dump de la base : format compressé, niveau 9, snapshot cohérent, pas d'attente indéfinie sur un verrou.
args=()
for s in $SCHEMAS; do args+=(-n "$s"); done
dump="$SORTIE/base.dump"
PARTIELS+=("$dump.partiel")
db pg_dump -U "$PG_USER" -d "$PG_BASE" -Fc -Z 9 --serializable-deferrable --lock-wait-timeout=60000 "${args[@]}" > "$dump.partiel"
# Contrôle : le dump doit être lisible par pg_restore (son sommaire) avant d'être conservé.
entrees=$(db pg_restore -l < "$dump.partiel" | grep -c '^[0-9]' || true)
mv "$dump.partiel" "$dump"
taille_dump=$(stat -c %s "$dump")
log "base.dump : $(octets "$taille_dump") ($taille_dump octets), $entrees entrées au sommaire pg_restore"
log "Rapport dump / base : $(awk -v d="$taille_dump" -v b="$taille_base" 'BEGIN { printf "%.1f %% de la taille de la base (gain : %.1f %%)", 100*d/b, 100*(1-d/b) }')"
lignes_table=$(db pg_restore -l < "$dump" | grep -c ' TABLE DATA ' || true)
log "Tables avec données dans le dump : $lignes_table"

# 3. Fichiers Storage : tar compressé niveau 9, contrôle du nombre de fichiers
fichiers="$SORTIE/fichiers-storage.tar.gz"
PARTIELS+=("$fichiers.partiel")
stockage | gzip -9 > "$fichiers.partiel"
mv "$fichiers.partiel" "$fichiers"
nb_fichiers=$(tar -tzf "$fichiers" | grep -vc '/$' || true)
log "fichiers-storage.tar.gz : $(octets "$(stat -c %s "$fichiers")"), $nb_fichiers fichier(s)"
if [ -n "$CONTENEUR_DB" ] || [ -n "${PGHOST:-}" ] || true; then
  nb_objets=$(db psql -U "$PG_USER" -d "$PG_BASE" -At -c "select count(*) from storage.objects")
  log "Lignes storage.objects : $nb_objets"
  if [ "$nb_objets" != "$nb_fichiers" ]; then
    log "AVERTISSEMENT : $nb_objets ligne(s) storage.objects pour $nb_fichiers fichier(s) dans l'archive. À examiner avant envoi."
  fi
fi

# 4. Empreintes
(cd "$SORTIE" && sha256sum base.dump fichiers-storage.tar.gz > SHA256SUMS)
log ""
log "Empreintes : $SORTIE/SHA256SUMS"
log "Terminé. Envoyez le dossier $SORTIE par un canal privé (il contient les données personnelles)."
