<#
.SYNOPSIS
  Sauvegarde distante de l'ancien Supabase, lancee depuis ce PC Windows.

.DESCRIPTION
  Demarre un conteneur Docker jetable (client PostgreSQL) qui se connecte a
  distance a la base, execute pg_dump -Fc -Z 9 (schemas public, auth, storage),
  puis telecharge les fichiers Storage par HTTP a partir des lignes
  storage.objects du dump. Rien n'est lance sur le serveur. Le conteneur est
  supprime a la fin (--rm). L'image et le dossier temporaire ne sont supprimes
  qu'apres votre accord.

.EXAMPLE
  .\sauvegarde-distante.ps1 -Hote 192.168.1.20 -Utilisateur supabase_admin

.EXAMPLE
  .\sauvegarde-distante.ps1 -Hote 192.168.1.20 -Port 5432 -Base postgres -ApiUrl http://192.168.1.20:8000
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Hote,
  [int]$Port = 5432,
  [string]$Utilisateur = 'supabase_admin',
  [string]$Base = 'postgres',
  [string]$ApiUrl = '',
  [string]$Image = 'postgres:17-alpine',
  [string]$Dossier = ''
)

$ErrorActionPreference = 'Stop'

# Script execute dans le conteneur (POSIX sh, busybox). Ecrit dans le dossier temporaire.
$scriptConteneur = @'
#!/bin/sh
# Execute DANS le conteneur jetable, lance par sauvegarde-distante.ps1.
# Aucune commande n'est executee sur le serveur : connexion PostgreSQL et HTTP uniquement.
set -eu

W=${W:-/work}
ETAT=$W/etat.txt
RAPPORT=$W/rapport.txt
INTERVALLE=${INTERVALLE:-15}
TAB=$(printf '\t')
: > "$RAPPORT"
log() { printf '%s\n' "$*" | tee -a "$RAPPORT"; }

for v in PGHOST PGPORT PGUSER PGDATABASE OCR_API_URL OCR_SERVICE_KEY; do
  eval "val=\${$v:-}"
  if [ -z "$val" ]; then echo "Variable manquante dans le conteneur : $v" >&2; exit 2; fi
done

DEPUIS=$(date +%s)
echo "demarrage|0|0" > "$ETAT"

# Ligne d'etat toutes les INTERVALLE secondes (15 par defaut) : etape, taille du dump, fichiers, debit.
(
  prec=-1
  while sleep "$INTERVALLE"; do
    IFS='|' read -r etape nb oct < "$ETAT" || true
    dump=$(stat -c %s "$W/base.dump" 2>/dev/null || echo 0)
    tot=$((dump + oct))
    if [ "$prec" -lt 0 ]; then debit=0; else debit=$(( (tot - prec) / INTERVALLE / 1024 )); fi
    prec=$tot
    s=$(( $(date +%s) - DEPUIS ))
    printf '[%d min %02d s] %s | dump %d Mo | fichiers Storage %s (%d Mo) | debit ~%d Ko/s\n' \
      $((s / 60)) $((s % 60)) "$etape" $((dump / 1048576)) "${nb:-0}" $((oct / 1048576)) "$debit"
  done
) &
STATUT_PID=$!
trap 'kill $STATUT_PID 2>/dev/null || true; rm -f "$W/base.dump.partiel"' EXIT

# Encode un nom pour une URL (les / sont conserves). Compatible busybox od et awk.
urlenc() {
  printf '%s' "$1" | od -An -v -tu1 | awk '
    BEGIN { for (i = 33; i < 127; i++) ch[i] = sprintf("%c", i) }
    {
      for (f = 1; f <= NF; f++) {
        n = $f + 0
        if ((n >= 48 && n <= 57) || (n >= 65 && n <= 90) || (n >= 97 && n <= 122) || n == 45 || n == 46 || n == 95 || n == 126 || n == 47)
          printf "%s", ch[n]
        else
          printf "%%%02X", n
      }
    }'
}

# Telechargement avec 3 essais. Le fichier partiel est supprime en cas d'echec.
telecharger() {
  essai=1
  while :; do
    if wget -q -O "$2" --header="apikey: $OCR_SERVICE_KEY" --header="Authorization: Bearer $OCR_SERVICE_KEY" "$1"; then
      return 0
    fi
    rm -f "$2"
    if [ "$essai" -ge 3 ]; then return 1; fi
    essai=$((essai + 1))
    sleep $((essai * 3))
  done
}

# Point d'insertion du filtre par compte : lit la liste d'objets ($1) et ecrit la liste retenue sur stdout.
filtrer_objets() {
  cat "$1"
}

# 1. pg_dump distant : format compresse niveau 9, snapshot coherent, pas d'attente indefinie sur un verrou.
echo "1/4 pg_dump|0|0" > "$ETAT"
log "1/4 pg_dump -Fc -Z 9 de $PGUSER@$PGHOST:$PGPORT/$PGDATABASE (schemas public, auth, storage)"
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  -Fc -Z 9 --serializable-deferrable --lock-wait-timeout=60000 \
  -n public -n auth -n storage -f "$W/base.dump.partiel"

pg_restore -l "$W/base.dump.partiel" > "$W/sommaire.txt"
for s in public auth storage; do
  if ! grep -q " SCHEMA - $s " "$W/sommaire.txt"; then
    log "ERREUR : le schema $s est absent du dump"
    exit 3
  fi
done
mv "$W/base.dump.partiel" "$W/base.dump"
log "Dump : $(stat -c %s "$W/base.dump") octets, $(grep -c ' TABLE DATA ' "$W/sommaire.txt") table(s) avec donnees"
taille_base=$(psql -At -c "select pg_database_size(current_database())")
log "pg_database_size de la base source : $taille_base octets"

# 2. Lignes du dump : comptes exacts par table et liste des objets Storage (bucket, nom).
echo "2/4 lecture des lignes du dump|0|0" > "$ETAT"
pg_restore -a -f "$W/donnees.sql" "$W/base.dump"
cat > "$W/extrait.awk" <<'AWK'
function decode(s,    out, i, n, c, d) {
  out = ""
  n = length(s)
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    if (c == "\\" && i < n) {
      i++
      d = substr(s, i, 1)
      if (d == "t") out = out "\t"
      else if (d == "n") out = out "\n"
      else if (d == "r") out = out "\r"
      else out = out d
    } else {
      out = out c
    }
  }
  return out
}
dans && $0 == "\\." { dans = 0; next }
dans {
  comptes_table[table]++
  if (table == "storage.objects") {
    n = split($0, f, "\t")
    b = decode(f[ib])
    o = decode(f[inom])
    if (index(b, "\t") || index(o, "\t") || index(b, "\n") || index(o, "\n")) {
      print "nom avec tabulation ou retour a la ligne : " b > "/dev/stderr"
      erreur = 1
      exit 1
    }
    print b "\t" o > sortie
  }
  next
}
/^COPY / {
  table = $2
  intro = $0
  sub(/^[^(]*\(/, "", intro)
  sub(/\) FROM stdin;$/, "", intro)
  ncols = split(intro, cols, ", ")
  ib = 0
  inom = 0
  for (k = 1; k <= ncols; k++) {
    if (cols[k] == "bucket_id") ib = k
    if (cols[k] == "name") inom = k
  }
  if (table == "storage.objects" && (ib == 0 || inom == 0)) {
    print "colonnes bucket_id ou name introuvables dans storage.objects" > "/dev/stderr"
    erreur = 1
    exit 1
  }
  comptes_table[table] = 0
  dans = 1
  next
}
END {
  for (t in comptes_table) print t " = " comptes_table[t] > comptes
  if (erreur) exit 1
}
AWK
: > "$W/objets.tsv"
if ! awk -v sortie="$W/objets.tsv" -v comptes="$W/lignes.txt" -f "$W/extrait.awk" "$W/donnees.sql"; then
  log "ERREUR : extraction des lignes impossible (voir le message ci-dessus)"
  exit 4
fi
rm -f "$W/donnees.sql" "$W/extrait.awk"
log "Lignes par table (depuis le dump) :"
sort "$W/lignes.txt" | while IFS= read -r ligne; do log "  $ligne"; done
filtrer_objets "$W/objets.tsv" > "$W/objets-retenus.tsv"

# 3. Fichiers Storage : telechargement HTTP depuis le conteneur, vers le dossier temporaire.
echo "3/4 telechargement Storage|0|0" > "$ETAT"
mkdir -p "$W/storage"
nb=0
oct=0
echecs=0
total=$(wc -l < "$W/objets-retenus.tsv" | tr -d ' ')
log "3/4 telechargement de $total fichier(s) depuis $OCR_API_URL"
while IFS=$TAB read -r bucket nom; do
  url="$OCR_API_URL/storage/v1/object/$(urlenc "$bucket")/$(urlenc "$nom")"
  cible="$W/storage/$bucket/$nom"
  mkdir -p "$(dirname "$cible")"
  if telecharger "$url" "$cible"; then
    nb=$((nb + 1))
    oct=$((oct + $(stat -c %s "$cible")))
  else
    echecs=$((echecs + 1))
    log "ECHEC : $bucket/$nom"
  fi
  echo "3/4 telechargement Storage ($nb/$total)|$nb|$oct" > "$ETAT"
done < "$W/objets-retenus.tsv"

# 4. Verifications et bilan.
echo "4/4 verifications|$nb|$oct" > "$ETAT"
log "4/4 fichiers Storage telecharges : $nb sur $total (lignes storage.objects du dump), $echecs echec(s), $((oct / 1048576)) Mo"
log "base.dump : $(stat -c %s "$W/base.dump") octets (pg_database_size source : $taille_base octets)"
if [ "$echecs" -gt 0 ]; then
  log "TERMINE AVEC ERREURS : $echecs fichier(s) non telecharge(s)"
  exit 5
fi
log "TERMINE : sauvegarde complete."
exit 0
'@

function Convertir-VersConteneur([string]$h) {
  if ($h -in @('localhost', '127.0.0.1', '::1')) { return 'host.docker.internal' }
  return $h
}

function Lire-Secret([string]$invite) {
  $s = Read-Host -Prompt $invite -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Demander-OuiNon([string]$question, [bool]$defaut) {
  $suffixe = if ($defaut) { '(O/n)' } else { '(o/N)' }
  $r = Read-Host "$question $suffixe"
  if ([string]::IsNullOrWhiteSpace($r)) { return $defaut }
  return ($r.Trim().ToLower() -in @('o', 'oui', 'y', 'yes'))
}

# Les appels natifs (docker) ecrivent sur stderr : on ne les fait pas echouer le script sur ce flux.
function Appeler-Docker {
  $prec = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & docker @args | Out-Host; return $LASTEXITCODE }
  finally { $ErrorActionPreference = $prec }
}

$horodatage = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $ApiUrl) { $ApiUrl = "http://${Hote}:8000" }
$apiConteneur = $ApiUrl -replace '^(https?://)(localhost|127\.0\.0\.1)(?=[:/]|$)', '${1}host.docker.internal'
$hoteConteneur = Convertir-VersConteneur $Hote

$prec = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& docker info --format '{{.ServerVersion}}' > $null 2>&1
$dockerOk = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prec
if (-not $dockerOk) { throw 'Docker ne repond pas : demarrez Docker Desktop, puis relancez ce script.' }

$imageAvant = $false
$prec = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& docker image inspect $Image > $null 2>&1
$imageAvant = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prec

if (-not $Dossier) {
  $Dossier = Join-Path $env:TEMP ("ocr-sauvegarde-$horodatage-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
}
if ((Test-Path -LiteralPath $Dossier) -and ((Get-ChildItem -LiteralPath $Dossier -Force | Measure-Object).Count -gt 0)) {
  throw "Le dossier $Dossier n'est pas vide."
}
New-Item -ItemType Directory -Path $Dossier -Force | Out-Null
$Dossier = (Resolve-Path -LiteralPath $Dossier).Path

$cheminScript = Join-Path $Dossier 'run.sh'
[IO.File]::WriteAllText($cheminScript, ($scriptConteneur -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding($false)))

$mdpSecret = Lire-Secret "Mot de passe PostgreSQL de $Utilisateur"
$cleApi = if ($env:OCR_SERVICE_KEY) { $env:OCR_SERVICE_KEY } else { Lire-Secret 'Cle service_role (Storage)' }

$nomConteneur = 'ocr-sauvegarde-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$code = -1
$etapeFinale = ''
try {
  Write-Host "Image : $Image $(if ($imageAvant) { '(deja presente)' } else { '(sera telechargee)' })"
  $prec = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & docker pull $Image
  $ErrorActionPreference = $prec

  $env:PGHOST = $hoteConteneur
  $env:PGPORT = "$Port"
  $env:PGUSER = $Utilisateur
  $env:PGDATABASE = $Base
  $env:PGPASSWORD = $mdpSecret
  $env:OCR_API_URL = $apiConteneur
  $env:OCR_SERVICE_KEY = $cleApi

  $dockerArgs = @(
    'run', '--rm', '--init', '--name', $nomConteneur,
    '--mount', "type=bind,source=$Dossier,target=/work",
    '--entrypoint', '/bin/sh',
    '-e', 'PGHOST', '-e', 'PGPORT', '-e', 'PGUSER', '-e', 'PGDATABASE', '-e', 'PGPASSWORD',
    '-e', 'OCR_API_URL', '-e', 'OCR_SERVICE_KEY',
    $Image, '/work/run.sh'
  )
  Write-Host "Conteneur jetable $nomConteneur : pg_dump puis telechargement Storage (ligne d'etat toutes les 15 s)."
  $code = Appeler-Docker @dockerArgs

  if ($code -eq 0) {
    $empreintes = @()
    $empreintes += (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Dossier 'base.dump')).Hash.ToLower() + '  base.dump'
    Set-Content -LiteralPath (Join-Path $Dossier 'SHA256SUMS') -Value $empreintes -Encoding ASCII
    $nbFichiers = (Get-ChildItem -LiteralPath (Join-Path $Dossier 'storage') -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Host ''
    Write-Host 'SAUVEGARDE TERMINEE' -ForegroundColor Green
    Write-Host "Dossier : $Dossier"
    Write-Host "  base.dump      : $((Get-Item -LiteralPath (Join-Path $Dossier 'base.dump')).Length) octets"
    Write-Host "  storage        : $nbFichiers fichier(s)"
    Write-Host "  rapport.txt    : comptes par table et tailles"
  } else {
    Write-Host "ECHEC (code $code). Le dossier est conserve pour diagnostic : $Dossier" -ForegroundColor Red
  }
}
finally {
  Remove-Item Env:PGPASSWORD, Env:OCR_SERVICE_KEY -ErrorAction SilentlyContinue
  $mdpSecret = $null
  $cleApi = $null

  $prec = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $reste = & docker ps -a --filter "name=$nomConteneur" --format '{{.Names}}' 2>$null
  if ($reste) { & docker rm -f $nomConteneur > $null 2>&1 }
  $ErrorActionPreference = $prec
  Write-Host "Conteneur $nomConteneur : supprime (--rm)."

  if ($imageAvant) {
    $defautImage = $false
    $questionImage = "Supprimer l'image $Image (elle existait deja avant ce script) ?"
  } else {
    $defautImage = $true
    $questionImage = "Supprimer l'image $Image telechargee par ce script ?"
  }
  if (Demander-OuiNon $questionImage $defautImage) {
    $prec = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & docker image rm $Image > $null 2>&1
    $ErrorActionPreference = $prec
    Write-Host "Image $Image supprimee."
  } else {
    Write-Host "Image $Image conservee."
  }

  if (Demander-OuiNon "Supprimer le dossier temporaire $Dossier (dump et fichiers Storage) ?" $false) {
    Remove-Item -LiteralPath $Dossier -Recurse -Force
    Write-Host 'Dossier temporaire supprime.'
  } else {
    Write-Host "Dossier temporaire conserve : $Dossier"
  }
}
