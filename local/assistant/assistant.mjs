// Assistant d'installation de l'application OCR (PC du client).
//
//   node assistant.mjs init     -> génère les mots de passe et clés de la base locale
//   node assistant.mjs migrer   -> pose les questions au client puis copie l'ancien
//                                  Supabase (serveur) vers le Supabase local
//
// L'ancien serveur est uniquement LU (requêtes en lecture seule) : rien n'y est modifié.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const ICI = path.dirname(fileURLToPath(import.meta.url))
const LOCAL = path.resolve(ICI, '..')
const PROJET = path.resolve(LOCAL, '..')
const MARQUEUR = path.join(LOCAL, '.migration-ok')
const ETAPE1 = path.join(LOCAL, '.migration-etape1-ok') // structure + données faites

const c = {
  titre: (s) => `\x1b[1;36m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  gras: (s) => `\x1b[1m${s}\x1b[0m`,
}
const dire = (s = '') => console.log(s)

// Délai d'inactivité d'une requête vers l'ancien serveur : au-delà, les paquets sont réduits.
const DELAI_REQUETE_MS = 60_000
// Une ligne d'état toutes les 15 s : état du serveur, mesures, avancement.
const INTERVALLE_SUIVI_MS = 15_000
// Nombre d'essais supplémentaires pour une ligne qui ne répond pas, avec un délai croissant.
const ESSAIS_LIGNE = 4
// Délai courant : augmenté temporairement quand une seule ligne résiste.
export const reglage = { delaiMs: DELAI_REQUETE_MS }
// Dernières requêtes terminées (heure, latence, octets, durée du transfert) pour classer le serveur.
export const suivi = { etape: '', detail: '', attente: null, dernierOctet: null, recu: 0, lignes: 0, lignesTotales: 0, paquet: 0, note: '', requetes: [] }
let minuterieSuivi = null
// Échantillons (heure, lignes copiées) pour estimer le débit récent et donc le temps restant.
let echantillons = []
const FENETRE_ESTIMATION_MS = 5 * 60_000
const duree = (secondes) => {
  if (secondes < 60) return `${Math.round(secondes)} s`
  if (secondes < 3600) return `${Math.round(secondes / 60)} min`
  return `${Math.floor(secondes / 3600)} h ${Math.round((secondes % 3600) / 60)} min`
}
const virgule = (x) => x.toFixed(1).replace('.', ',')
// Classe le serveur d'après le débit mesuré sur les dernières minutes, et signale les silences.
function etatServeur(maintenant) {
  const recentes = suivi.requetes.filter((r) => maintenant - r.t <= FENETRE_ESTIMATION_MS)
  const silence = suivi.attente ? maintenant - Math.max(suivi.attente, suivi.dernierOctet ?? 0) : 0
  const dernier = suivi.dernierOctet ? `dernier octet il y a ${Math.round((maintenant - suivi.dernierOctet) / 1000)} s` : 'aucun octet reçu'
  if (suivi.attente && silence >= 30_000) {
    return `TRÈS LENT (aucune donnée depuis ${Math.round(silence / 1000)} s) | ${dernier}`
  }
  if (!recentes.length) return `mesure en cours | ${dernier}`
  const octets = recentes.reduce((a, r) => a + r.octets, 0)
  const temps = recentes.reduce((a, r) => a + Math.max(r.corps, 1), 0)
  const debitKo = (octets / 1024) / (temps / 1000)
  const latence = recentes.reduce((a, r) => a + r.ttfb, 0) / recentes.length / 1000
  const etat = debitKo >= 2000 ? 'TRÈS RAPIDE'
    : debitKo >= 500 ? 'RAPIDE'
    : debitKo >= 150 ? 'NORMAL'
    : debitKo >= 40 ? 'LENT'
    : 'TRÈS LENT'
  return `${etat} | débit ${debitKo.toFixed(0)} Ko/s (5 dernières min) | latence ${virgule(latence)} s | ${dernier}`
}
export function demarrerSuivi() {
  const debut = Date.now()
  echantillons = []
  minuterieSuivi = setInterval(() => {
    const maintenant = Date.now()
    const s = Math.floor((maintenant - debut) / 1000)
    const horloge = `[${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s]`
    // Ligne 1 : état du serveur et mesures.
    const ligne1 = `\n  ${horloge} SERVEUR : ${etatServeur(maintenant)}`
    // Ligne 2 : avancement, total à atteindre et temps restant estimé (débit des 5 dernières minutes).
    echantillons.push({ t: maintenant, n: suivi.lignes })
    echantillons = echantillons.filter((e) => maintenant - e.t <= FENETRE_ESTIMATION_MS)
    let avancement = ''
    if (suivi.lignesTotales) {
      const pct = Math.floor((100 * suivi.lignes) / suivi.lignesTotales)
      const premier = echantillons[0]
      const dernier = echantillons[echantillons.length - 1]
      const debit = premier && dernier.t - premier.t >= 10_000 ? (dernier.n - premier.n) / ((dernier.t - premier.t) / 1000) : 0
      const reste = suivi.lignesTotales - suivi.lignes
      const temps = debit > 0 ? `reste ~${duree(reste / debit)} (estimation)` : 'temps restant : calcul en cours'
      avancement = ` | lignes ${suivi.lignes} / ${suivi.lignesTotales} (${pct} %) | ${temps}`
    }
    const detail = suivi.detail ? ` : ${suivi.detail}` : ''
    const paquet = suivi.paquet ? ` | paquet ${suivi.paquet} ligne(s)` : ''
    const recu = suivi.recu ? ` | ${(suivi.recu / 1048576).toFixed(1)} Mo reçus` : ''
    const note = suivi.note ? `\n    ${suivi.note}` : ''
    process.stdout.write(`${ligne1}\n    ${suivi.etape}${detail}${paquet}${recu}${avancement}${note}\n`)
  }, INTERVALLE_SUIVI_MS)
  minuterieSuivi.unref()
}
export function arreterSuivi() {
  clearInterval(minuterieSuivi)
  suivi.attente = null
}

// ---------------------------------------------------------------------------
// init : secrets de la base locale
// ---------------------------------------------------------------------------

const b64url = (v) => Buffer.from(v).toString('base64url')
function jwt(payload, secret) {
  const corps = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}`
  return `${corps}.${crypto.createHmac('sha256', secret).update(corps).digest('base64url')}`
}
const hasard = (n) => crypto.randomBytes(n).toString('hex')
function motDePasseLisible() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.randomBytes(16), (b) => a[b % a.length]).join('')
}

function init() {
  const fichierEnv = path.join(LOCAL, '.env')
  if (fs.existsSync(fichierEnv)) {
    dire('Configuration locale déjà présente : rien à générer.')
    return
  }
  const JWT_SECRET = hasard(32)
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 20 * 365 * 24 * 3600
  const ANON_KEY = jwt({ role: 'anon', iss: 'supabase', iat, exp }, JWT_SECRET)
  const SERVICE_ROLE_KEY = jwt({ role: 'service_role', iss: 'supabase', iat, exp }, JWT_SECRET)
  const DASHBOARD_PASSWORD = motDePasseLisible()

  fs.writeFileSync(fichierEnv, [
    '# Généré automatiquement par Installer-OCR. Ne pas modifier, ne pas partager.',
    `POSTGRES_PASSWORD=${hasard(24)}`,
    `JWT_SECRET=${JWT_SECRET}`,
    `ANON_KEY=${ANON_KEY}`,
    `SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}`,
    `PG_META_CRYPTO_KEY=${hasard(16)}`,
    'DASHBOARD_USERNAME=admin',
    `DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}`,
    '',
  ].join('\n'))

  fs.writeFileSync(path.join(PROJET, '.env.local'), [
    '# Généré automatiquement par Installer-OCR.',
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000',
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}`,
    'NEXT_PUBLIC_SITE_URL=http://localhost:3000',
    'NODE_ENV=production',
    '',
  ].join('\n'))

  fs.writeFileSync(path.join(PROJET, 'MES-ACCES.txt'), [
    'APPLICATION OCR - VOS ACCES (a conserver)',
    '',
    'Application :                 http://localhost:3000',
    '  -> connectez-vous avec votre e-mail et votre mot de passe habituels.',
    '',
    'Tableau de bord Supabase :    http://localhost:8000',
    '  Identifiant :  admin',
    `  Mot de passe : ${DASHBOARD_PASSWORD}`,
    '',
  ].join('\r\n'))

  dire(c.ok('Configuration locale créée.'))
}

// ---------------------------------------------------------------------------
// Accès à l'ancien Supabase (lecture seule, via HTTPS)
// ---------------------------------------------------------------------------

// Requête HTTP avec délai d'inactivité : le délai court depuis le dernier octet reçu.
// Une connexion lente mais active n'est jamais coupée ; seule une absence totale de données l'est.
async function reponseAvecDelai(adresse, init) {
  const delai = reglage.delaiMs
  const controleur = new AbortController()
  let minuterie = null
  const relancer = () => {
    clearTimeout(minuterie)
    minuterie = setTimeout(() => controleur.abort(), delai)
  }
  const morceaux = []
  try {
    const debut = Date.now()
    relancer()
    const rep = await fetch(adresse, { ...init, signal: controleur.signal })
    const ttfb = Date.now() - debut
    relancer()
    const debutCorps = Date.now()
    if (rep.body) {
      for await (const morceau of rep.body) {
        relancer()
        morceaux.push(Buffer.from(morceau))
        suivi.recu += morceau.length
        suivi.dernierOctet = Date.now()
      }
    }
    const corps = Buffer.concat(morceaux)
    // Mesure pour classer le serveur (latence = délai avant la réponse, débit = octets / durée du transfert).
    suivi.requetes.push({ t: Date.now(), ttfb, octets: corps.length, corps: Date.now() - debutCorps })
    if (suivi.requetes.length > 200) suivi.requetes.splice(0, suivi.requetes.length - 200)
    return { rep, corps }
  } catch (e) {
    if (controleur.signal.aborted) {
      throw Object.assign(new Error(`aucune donnée reçue depuis ${delai / 1000} s`), { lent: true })
    }
    throw e
  } finally {
    clearTimeout(minuterie)
  }
}

class AncienSupabase {
  constructor(url, cle) {
    this.url = url
    this.cle = cle
    this.basic = null // identifiants du tableau de bord (plan B)
  }

  entetesCle() {
    return { apikey: this.cle, Authorization: `Bearer ${this.cle}` }
  }

  // Exécute une requête SQL en lecture seule et renvoie les lignes.
  // En cas de coupure réseau passagère, réessaie jusqu'à 4 fois.
  async sql(requete) {
    for (let essai = 1; ; essai++) {
      try {
        return await this.sqlUneFois(requete)
      } catch (e) {
        const passager = e.type === 'reseau' || e.passager
        if (!passager || essai >= 4) throw e
        await new Promise((r) => setTimeout(r, 3000 * essai))
      }
    }
  }

  async sqlUneFois(requete) {
    const texte = `set local transaction read only; set local search_path = pg_catalog; ${requete}`
    const [adresse, entetes] = this.basic
      ? [`${this.url}/api/platform/pg-meta/default/query`, { Authorization: `Basic ${this.basic}` }]
      : [`${this.url}/pg/query`, this.entetesCle()]
    let rep
    let corps
    suivi.attente = Date.now()
    try {
      ;({ rep, corps } = await reponseAvecDelai(adresse, {
        method: 'POST',
        headers: { ...entetes, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: texte }),
      }))
    } catch (e) {
      // Serveur trop lent : on ne réessaie pas à l'identique, la copie réduit les paquets.
      if (e.lent) throw e
      throw new ErreurAcces('reseau', messageReseau(e))
    } finally {
      suivi.attente = null
    }
    corps = corps.toString('utf8')
    if (!rep.ok) {
      let detail = corps
      try { detail = JSON.parse(corps).error || JSON.parse(corps).message || corps } catch {}
      if (rep.status === 401 || rep.status === 403) throw new ErreurAcces('refus', detail)
      if (rep.status === 404) throw new ErreurAcces('absent', detail)
      const erreur = new Error(`Erreur SQL sur l'ancien serveur (${rep.status}) : ${detail}`)
      erreur.passager = rep.status >= 502
      throw erreur
    }
    const json = JSON.parse(corps)
    return Array.isArray(json) ? json : json.result ?? json
  }

  // 'ok', 'refus' ou un message d'erreur
  async verifierStockage() {
    try {
      const rep = await fetch(`${this.url}/storage/v1/bucket`, { headers: this.entetesCle() })
      if (rep.ok) return 'ok'
      const texte = await rep.text()
      if (rep.status === 401 || rep.status === 403 || /jwt|signature|unauthori/i.test(texte)) return 'refus'
      return `erreur ${rep.status} : ${texte.slice(0, 150)}`
    } catch (e) {
      return messageReseau(e)
    }
  }

  async telecharger(bucket, nom) {
    const chemin = nom.split('/').map(encodeURIComponent).join('/')
    for (let essai = 1; ; essai++) {
      try {
        suivi.attente = Date.now()
        suivi.detail = `${bucket}/${nom}`
        const { rep, corps } = await reponseAvecDelai(`${this.url}/storage/v1/object/${encodeURIComponent(bucket)}/${chemin}`, {
          headers: this.entetesCle(),
        })
        suivi.attente = null
        if (rep.ok) return corps
        const erreur = new Error(`téléchargement refusé (${rep.status}) : ${corps.toString('utf8').slice(0, 200)}`)
        erreur.definitif = rep.status < 500
        throw erreur
      } catch (e) {
        suivi.attente = null
        if (e.definitif || essai >= 4) throw new Error(e.definitif ? e.message : messageReseau(e))
        await new Promise((r) => setTimeout(r, 3000 * essai))
      }
    }
  }
}

// Traduit une erreur réseau technique en phrase compréhensible.
function messageReseau(e) {
  const code = e?.cause?.code || e?.code || ''
  const texte = `${e?.cause?.message || ''} ${e?.message || ''}`
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'adresse introuvable : vérifiez l\'orthographe et votre connexion Internet'
  if (code === 'ECONNREFUSED') return 'le serveur ne répond pas à cette adresse : vérifiez le numéro après « : » (par exemple :8000)'
  if (['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET'].includes(code)) return 'le serveur ne répond pas (délai dépassé) : vérifiez votre connexion Internet'
  if (/ssl|tls|certificate|CERT_|wrong version number/i.test(`${code} ${texte}`)) {
    return 'connexion sécurisée impossible : essayez avec http:// au lieu de https:// (ou l\'inverse)'
  }
  return texte.trim() || 'erreur inconnue'
}

class ErreurAcces extends Error {
  constructor(type, detail) {
    super(detail)
    this.type = type
  }
}


// ---------------------------------------------------------------------------
// Diagnostic détaillé (à envoyer au prestataire en cas de problème de connexion)
// ---------------------------------------------------------------------------

function resumeCle(cle) {
  if (!cle) return '(aucune)'
  let charge = ''
  try {
    const p = JSON.parse(Buffer.from(cle.split('.')[1], 'base64url').toString())
    const date = (t) => (t ? new Date(t * 1000).toISOString() : '?')
    charge = ` | role=${p.role} iss=${p.iss ?? '?'} iat=${date(p.iat)} exp=${date(p.exp)}`
  } catch {
    charge = ' | (pas un JWT lisible)'
  }
  return `${cle.length} caractères, ${cle.slice(0, 10)}...${cle.slice(-6)}${charge}`
}

async function sonder(methode, adresse, entetes = {}, corps) {
  const debut = Date.now()
  try {
    const rep = await fetch(adresse, { method: methode, headers: entetes, body: corps, signal: AbortSignal.timeout(20000) })
    const texte = (await rep.text()).replace(/\s+/g, ' ').slice(0, 300)
    const garder = ['server', 'content-type', 'www-authenticate', 'via', 'x-kong-response-latency', 'x-envoy-upstream-service-time']
    const h = garder.filter((k) => rep.headers.get(k)).map((k) => `${k}=${rep.headers.get(k)}`).join(' ; ')
    return `${methode} ${adresse}\n    -> HTTP ${rep.status} en ${Date.now() - debut} ms\n    -> en-têtes : ${h || '(aucun utile)'}\n    -> réponse : ${texte || '(vide)'}`
  } catch (e) {
    return `${methode} ${adresse}\n    -> ÉCHEC réseau : ${messageReseau(e)} [${e?.cause?.code || e?.name || ''}]`
  }
}

function lireInfosPC() {
  try {
    return fs.readFileSync(path.join(LOCAL, 'infos-pc.txt'), 'utf8').replace(/^\uFEFF/, '').replace(/\r/g, '').trim()
  } catch {
    return '(non disponible : relancez la commande d\'installation pour les collecter)'
  }
}

async function diagnostic(url, cle, contexte) {
  const k = cle ? { apikey: cle, Authorization: `Bearer ${cle}` } : {}
  let version = '?'
  try { version = fs.readFileSync(path.join(LOCAL, '.version'), 'utf8').trim().slice(0, 7) } catch {}

  const lignes = [
    '==================== DIAGNOSTIC A ENVOYER ====================',
    `Contexte     : ${contexte}`,
    `Date (UTC)   : ${new Date().toISOString()}`,
    `Version      : ${version}`,
    `Adresse      : ${url}`,
    `Clé          : ${resumeCle(cle)}`,
    '',
    await sonder('GET', `${url}/auth/v1/health`),
    await sonder('GET', `${url}/auth/v1/health`, k),
    await sonder('GET', `${url}/storage/v1/bucket`, k),
    await sonder('POST', `${url}/pg/query`, { ...k, 'Content-Type': 'application/json' }, JSON.stringify({ query: 'select 1 as ok' })),
    await sonder('GET', `${url}/rest/v1/`, k),
    '',
    '-------------------- CE PC (vu depuis Windows) --------------------',
    lireInfosPC(),
    '==============================================================',
  ]
  const texte = lignes.join('\n')
  dire()
  dire(texte)
  try {
    fs.writeFileSync(path.join(PROJET, 'diagnostic-supabase.txt'), texte.replace(/\n/g, '\r\n'))
    dire(c.gras('  Diagnostic enregistré dans le fichier « diagnostic-supabase.txt »'))
    dire(c.gras('  Envoyez ce fichier (ou une capture) à votre prestataire.'))
  } catch {}
  dire('  (La clé n\'y figure pas en entier : seuls son début et sa fin sont affichés.)')
  dire()
}

// ---------------------------------------------------------------------------
// Questions au client
// ---------------------------------------------------------------------------

function nettoyerUrl(saisie) {
  let u = saisie.trim().replace(/^["']|["']$/g, '')
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  const url = new URL(u)
  return `${url.protocol}//${url.host}`
}

function roleDeLaCle(cle) {
  if (cle.startsWith('sb_secret_')) return 'service_role'
  if (cle.startsWith('sb_publishable_')) return 'anon'
  try {
    return JSON.parse(Buffer.from(cle.split('.')[1], 'base64url').toString()).role
  } catch {
    return null
  }
}

async function demander(rl, question) {
  return (await rl.question(`${c.gras('> ')}${question}`)).trim()
}

async function questions(rl) {
  // Identifiants déjà connus du lanceur (mémorisés sur ce PC) : utilisés une seule fois, sans question.
  // Si un identifiant est refusé, la question revient normalement.
  const reprises = { adresse: process.env.OCR_ADRESSE || '', cle: process.env.OCR_CLE || '' }
  const saisir = async (nom, question) => {
    if (reprises[nom]) { const valeur = reprises[nom]; reprises[nom] = ''; return valeur }
    return demander(rl, question)
  }
  dire(c.titre('Question 1 sur 2 : l\'adresse de votre Supabase actuel'))
  dire('  1. Ouvrez l\'espace d\'administration Supabase dans votre navigateur.')
  dire('  2. Sur la page d\'accueil, sous le nom du projet, cliquez sur « Copy »,')
  dire('     puis sur « Project URL ».')
  dire('  3. Revenez ici, clic droit (ou Ctrl+V) pour coller, puis Entrée.')
  dire('  (Vous pouvez aussi copier l\'adresse de la barre d\'adresse du navigateur.)')
  dire('Exemples : http://51.68.12.34:8000   ou   https://supabase.mon-site.fr')
  dire()

  let url
  for (;;) {
    const saisie = await saisir('adresse', 'Adresse : ')
    try {
      url = nettoyerUrl(saisie)
      if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/i.test(url)) {
        dire(c.err('  Cette adresse (localhost) ne désigne pas le serveur, mais l\'ordinateur lui-même.'))
        dire('  Copiez plutôt l\'adresse affichée dans la barre d\'adresse du navigateur')
        dire('  quand l\'espace d\'administration Supabase est ouvert.')
        continue
      }
      const rep = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(20000) })
        .catch((e) => { throw new Error(e.name === 'TimeoutError' ? 'le serveur ne répond pas (délai dépassé)' : messageReseau(e)) })
      if (rep.status >= 500) throw new Error(`le serveur répond avec une erreur ${rep.status}`)
      dire(c.ok(`  Serveur trouvé : ${url}`))
      try { fs.writeFileSync(path.join(LOCAL, '.adresse-serveur'), url) } catch {}
      break
    } catch (e) {
      dire(c.err(`  Impossible de joindre cette adresse (${e.message}).`))
      dire('  Vérifiez-la (copiez-la depuis la barre d\'adresse du navigateur) puis réessayez.')
    }
  }

  dire()
  dire(c.titre('Question 2 sur 2 : la clé « service_role »'))
  dire('  1. Dans l\'espace d\'administration Supabase, cliquez en bas à gauche')
  dire('     sur la roue dentée (« Project Settings »).')
  dire('  2. Dans le menu, cliquez sur « API Keys » (ou « API » selon la version).')
  dire('  3. Cliquez sur l\'onglet « Legacy anon, service_role API keys ».')
  dire('  4. Sur la ligne « service_role » (étiquette rouge « secret »), cliquez sur « Reveal »,')
  dire('  5. puis sur « Copy » (attention : pas la clé « anon » juste au-dessus).')
  dire('  6. Revenez ici, clic droit (ou Ctrl+V) pour coller, puis Entrée.')
  dire('  Le guide d\'installation montre chaque étape en image.')
  dire()

  const ancien = new AncienSupabase(url, '')
  let refus = 0
  for (;;) {
    const cle = (await saisir('cle', 'Clé service_role : ')).replace(/\s+/g, '')
    const role = roleDeLaCle(cle)
    if (role === 'anon') {
      dire(c.err('  C\'est la clé « anon » (publique). Il faut celle juste en dessous : « service_role ».'))
      continue
    }
    if (role !== 'service_role') {
      dire(c.err('  Ce texte ne ressemble pas à une clé service_role. Recopiez-la avec le bouton « Copy ».'))
      continue
    }
    ancien.cle = cle
    // La clé doit d'abord ouvrir le stockage des fichiers (sinon la copie échouerait plus tard).
    const stockage = await ancien.verifierStockage()
    if (stockage === 'refus') {
      dire(c.err('  Le serveur refuse cette clé. Vérifiez que vous avez copié la clé « service_role » de CE serveur.'))
      await diagnostic(url, cle, 'clé refusée par le stockage des fichiers')
      continue
    }
    if (stockage !== 'ok') {
      await diagnostic(url, cle, `stockage des fichiers injoignable (${stockage})`)
      throw new Error(`Le stockage des fichiers du serveur ne répond pas (${stockage}).`)
    }
    try {
      await ancien.sql('select 1 as ok')
      dire(c.ok('  Clé acceptée.'))
      return ancien
    } catch (e) {
      await diagnostic(url, cle, `accès à la base refusé (${e.type || 'erreur'} : ${e.message})`)
      if (e.type === 'refus' && ++refus < 2) {
        dire(c.err('  Le serveur refuse cette clé. Vérifiez que vous avez copié la clé « service_role » de CE serveur.'))
        continue
      }
      if (e.type === 'refus' || e.type === 'absent') {
        // Accès SQL direct indisponible : on passe par le tableau de bord.
        return planB(rl, ancien)
      }
      throw e
    }
  }
}

async function planB(rl, ancien) {
  dire()
  dire(c.titre('Une dernière information : vos identifiants du tableau de bord Supabase'))
  dire('Ce sont l\'identifiant et le mot de passe que le navigateur vous demande')
  dire('quand vous ouvrez le tableau de bord Supabase.')
  for (;;) {
    const id = await demander(rl, 'Identifiant : ')
    const mdp = await demander(rl, 'Mot de passe : ')
    ancien.basic = Buffer.from(`${id}:${mdp}`).toString('base64')
    try {
      await ancien.sql('select 1 as ok')
      dire(c.ok('  Connexion réussie.'))
      return ancien
    } catch (e) {
      if (e.type === 'refus') { dire(c.err('  Identifiant ou mot de passe incorrect, réessayez.')); continue }
      throw new Error(`Le serveur ne permet pas la copie automatique (${e.message}). Contactez votre prestataire.`)
    }
  }
}

// ---------------------------------------------------------------------------
// Lecture de la structure de l'ancienne base
// ---------------------------------------------------------------------------

const PAS_EXTENSION = (col) =>
  `not exists (select 1 from pg_depend d where d.objid = ${col} and d.deptype = 'e')`

async function lireStructure(src) {
  const tables = await src.sql(`
    select c.oid::int as oid, quote_ident(c.relname) as nom, 'public.' || quote_ident(c.relname) as q,
           c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
           pg_get_userbyid(c.relowner) as proprietaire
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and ${PAS_EXTENSION('c.oid')}
    order by c.oid`)
  const oids = tables.map((t) => t.oid)
  const liste = oids.length ? oids.join(',') : '0'

  const [colonnes, contraintes, index, sequences, fonctions, types, vues, politiques,
    declencheurs, extensions, droits, autres] = await Promise.all([
    src.sql(`
      select a.attrelid::int as oid, a.attname as nom, quote_ident(a.attname) as q,
             format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as non_nul,
             pg_get_expr(d.adbin, d.adrelid) as defaut, a.attidentity as identite,
             a.attgenerated as genere, a.attnum::int as num
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid in (${liste}) and a.attnum > 0 and not a.attisdropped
      order by a.attrelid, a.attnum`),
    src.sql(`
      select conrelid::int as oid, quote_ident(conname) as nom, contype as type,
             pg_get_constraintdef(oid) as def
      from pg_constraint
      where conrelid in (${liste}) and contype in ('p','u','c','f','x')
      order by case contype when 'p' then 0 when 'u' then 1 when 'c' then 2 when 'x' then 3 else 4 end, oid`),
    src.sql(`
      select pg_get_indexdef(i.indexrelid) as def
      from pg_index i
      where i.indrelid in (${liste})
        and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid and k.conrelid = i.indrelid)`),
    src.sql(`
      select 'public.' || quote_ident(c.relname) as q, format_type(s.seqtypid, null) as type,
             s.seqstart::text as debut, s.seqincrement::text as pas, s.seqmin::text as min,
             s.seqmax::text as max, s.seqcache::text as cache, s.seqcycle as cycle,
             ps.last_value::text as valeur, pg_get_userbyid(c.relowner) as proprietaire,
             (select 'public.' || quote_ident(t.relname) || '.' || quote_ident(a.attname)
                from pg_depend d join pg_class t on t.oid = d.refobjid
                join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
               where d.objid = c.oid and d.deptype = 'a' limit 1) as appartient_a
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_sequence s on s.seqrelid = c.oid
      left join pg_sequences ps on ps.schemaname = n.nspname and ps.sequencename = c.relname
      where n.nspname = 'public' and c.relkind = 'S' and ${PAS_EXTENSION('c.oid')}
        and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'i')`),
    src.sql(`
      select pg_get_functiondef(p.oid) as def, p.oid::regprocedure::text as signature,
             pg_get_userbyid(p.proowner) as proprietaire
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind in ('f','p') and ${PAS_EXTENSION('p.oid')}
      order by p.oid`),
    src.sql(`
      select 'public.' || quote_ident(t.typname) as q,
             array_agg(quote_literal(e.enumlabel) order by e.enumsortorder) as valeurs
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public' and ${PAS_EXTENSION('t.oid')}
      group by t.typname`),
    src.sql(`
      select 'public.' || quote_ident(c.relname) as q, c.relkind as type,
             pg_get_viewdef(c.oid) as def, c.reloptions as options,
             pg_get_userbyid(c.relowner) as proprietaire
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('v','m') and ${PAS_EXTENSION('c.oid')}
      order by c.oid`),
    src.sql(`
      select quote_ident(p.polname) as nom, quote_ident(n.nspname) || '.' || quote_ident(c.relname) as table_q,
             p.polpermissive as permissive, p.polcmd as cmd,
             array(select case when r = 0 then 'public' else quote_ident(pg_get_userbyid(r)) end
                     from unnest(p.polroles) r) as roles,
             pg_get_expr(p.polqual, p.polrelid) as using_expr,
             pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
      from pg_policy p join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'storage')`),
    src.sql(`
      select pg_get_triggerdef(t.oid) as def
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
      where not t.tgisinternal and (n.nspname = 'public' or pn.nspname = 'public')`),
    src.sql(`
      select e.extname as nom, n.nspname as schema
      from pg_extension e join pg_namespace n on n.oid = e.extnamespace
      where e.extname <> 'plpgsql'`),
    src.sql(`
      select 'table' as genre, 'public.' || quote_ident(c.relname) as q, c.relkind as type,
             case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end as qui,
             a.privilege_type as droit
      from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
      where n.nspname = 'public' and c.relkind in ('r','v','m','S') and ${PAS_EXTENSION('c.oid')}
      union all
      select 'fonction', p.oid::regprocedure::text, 'f',
             case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end,
             a.privilege_type
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(p.proacl) a
      where n.nspname = 'public' and ${PAS_EXTENSION('p.oid')}`),
    src.sql(`
      select n.nspname as schema
      from pg_namespace n
      where n.nspname not like 'pg\\_%' and n.nspname not in (
        'public','information_schema','auth','storage','extensions','graphql','graphql_public',
        'realtime','_realtime','net','pgsodium','pgsodium_masks','vault','supabase_functions',
        'supabase_migrations','_analytics','_supavisor','pgbouncer','pgmq','cron','topology','tiger','tiger_data')
        and exists (select 1 from pg_class c where c.relnamespace = n.oid)`),
  ])

  // Domaines (types avec règles) et types composés définis dans public
  const domaines = await src.sql(`
    select 'public.' || quote_ident(t.typname) as q, format_type(t.typbasetype, t.typtypmod) as base,
           t.typnotnull as non_nul, t.typdefault as defaut,
           array(select 'constraint ' || quote_ident(k.conname) || ' ' || pg_get_constraintdef(k.oid)
                   from pg_constraint k where k.contypid = t.oid) as regles
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'd' and ${PAS_EXTENSION('t.oid')}`)
  const composes = await src.sql(`
    select 'public.' || quote_ident(t.typname) as q,
           array(select quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
                   from pg_attribute a where a.attrelid = t.typrelid and a.attnum > 0 and not a.attisdropped
                  order by a.attnum) as champs
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    join pg_class c on c.oid = t.typrelid
    where n.nspname = 'public' and t.typtype = 'c' and c.relkind = 'c' and ${PAS_EXTENSION('t.oid')}`)

  for (const t of tables) t.colonnes = colonnes.filter((col) => col.oid === t.oid)
  return { tables, contraintes, index, sequences, fonctions, types, domaines, composes, vues, politiques,
    declencheurs, extensions, droits, autresSchemas: autres.map((r) => r.schema) }
}

// Rôles cités (propriétaires, droits, politiques) qui doivent exister en local.
function rolesCites(s) {
  const roles = new Set()
  const ajouter = (r) => r && r !== 'public' && roles.add(r.replace(/^"|"$/g, ''))
  s.tables.forEach((t) => ajouter(t.proprietaire))
  s.fonctions.forEach((f) => ajouter(f.proprietaire))
  s.vues.forEach((v) => ajouter(v.proprietaire))
  s.sequences.forEach((q) => ajouter(q.proprietaire))
  s.droits.forEach((d) => ajouter(d.qui))
  s.politiques.forEach((p) => p.roles.forEach(ajouter))
  return [...roles]
}

const qid = (s) => `"${String(s).replace(/"/g, '""')}"`
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

function scriptStructure(s) {
  const sql = []
  const pousser = (x) => sql.push(x)
  const CMD = { r: 'select', a: 'insert', w: 'update', d: 'delete', '*': 'all' }

  for (const r of rolesCites(s)) {
    pousser(`do $$ begin if not exists (select 1 from pg_roles where rolname = ${lit(r)}) then create role ${qid(r)} nologin; end if; end $$;`)
  }
  for (const t of s.types) pousser(`create type ${t.q} as enum (${t.valeurs.join(', ')});`)
  for (const d of s.domaines) {
    let x = `create domain ${d.q} as ${d.base}`
    if (d.defaut) x += ` default ${d.defaut}`
    if (d.non_nul) x += ' not null'
    if (d.regles.length) x += ` ${d.regles.join(' ')}`
    pousser(`${x};`)
  }
  for (const t of s.composes) pousser(`create type ${t.q} as (${t.champs.join(', ')});`)
  for (const q of s.sequences) {
    pousser(`create sequence ${q.q} as ${q.type} increment ${q.pas} minvalue ${q.min} maxvalue ${q.max} start ${q.debut} cache ${q.cache}${q.cycle ? ' cycle' : ''};`)
  }
  // Tables (sans valeurs par défaut : elles peuvent appeler des fonctions créées plus loin)
  for (const t of s.tables) {
    const cols = t.colonnes.map((col) => {
      let d = `${col.q} ${col.type}`
      if (col.genere === 's') d += ` generated always as (${col.defaut}) stored`
      if (col.identite === 'a') d += ' generated always as identity'
      if (col.identite === 'd') d += ' generated by default as identity'
      if (col.non_nul) d += ' not null'
      return d
    })
    pousser(`create table ${t.q} (\n  ${cols.join(',\n  ')}\n);`)
  }
  for (const q of s.sequences) if (q.appartient_a) pousser(`alter sequence ${q.q} owned by ${q.appartient_a};`)
  for (const f of s.fonctions) pousser(`${f.def};`)
  for (const t of s.tables) {
    for (const col of t.colonnes) {
      if (col.defaut && !col.genere && !col.identite) pousser(`alter table ${t.q} alter column ${col.q} set default ${col.defaut};`)
    }
  }
  for (const k of s.contraintes) {
    const t = s.tables.find((x) => x.oid === k.oid)
    pousser(`alter table ${t.q} add constraint ${k.nom} ${k.def};`)
  }
  for (const i of s.index) pousser(`${i.def};`)
  for (const v of s.vues) {
    const opts = v.options?.length ? ` with (${v.options.join(', ')})` : ''
    pousser(v.type === 'm'
      ? `create materialized view ${v.q}${opts} as ${v.def.replace(/;\s*$/, '')} with no data;`
      : `create view ${v.q}${opts} as ${v.def.replace(/;\s*$/, '')};`)
  }
  for (const t of s.tables) {
    if (t.rls) pousser(`alter table ${t.q} enable row level security;`)
    if (t.force_rls) pousser(`alter table ${t.q} force row level security;`)
  }
  for (const p of s.politiques) {
    let d = `create policy ${p.nom} on ${p.table_q} as ${p.permissive ? 'permissive' : 'restrictive'} for ${CMD[p.cmd]} to ${p.roles.join(', ')}`
    if (p.using_expr) d += ` using (${p.using_expr})`
    if (p.check_expr) d += ` with check (${p.check_expr})`
    pousser(`${d};`)
  }
  for (const t of s.declencheurs) pousser(`${t.def};`)
  // Droits : on retire ceux donnés par défaut en local, puis on remet exactement ceux du serveur.
  const ROLES_API = 'public, anon, authenticated, service_role'
  s.tables.forEach((t) => pousser(`revoke all on table ${t.q} from ${ROLES_API};`))
  s.vues.forEach((v) => pousser(`revoke all on table ${v.q} from ${ROLES_API};`))
  s.sequences.forEach((q) => pousser(`revoke all on sequence ${q.q} from ${ROLES_API};`))
  s.fonctions.forEach((f) => pousser(`revoke all on function ${f.signature} from ${ROLES_API};`))
  for (const d of s.droits) {
    const objet = d.genre === 'fonction' ? `function ${d.q}` : d.type === 'S' ? `sequence ${d.q}` : `table ${d.q}`
    pousser(`grant ${d.droit.toLowerCase()} on ${objet} to ${d.qui};`)
  }
  const proprio = (genre, q, r) => r && r !== 'supabase_admin' && pousser(`alter ${genre} ${q} owner to ${qid(r)};`)
  s.tables.forEach((t) => proprio('table', t.q, t.proprietaire))
  s.sequences.forEach((q) => proprio('sequence', q.q, q.proprietaire))
  s.fonctions.forEach((f) => proprio('routine', f.signature, f.proprietaire))
  s.vues.forEach((v) => proprio(v.type === 'm' ? 'materialized view' : 'view', v.q, v.proprietaire))
  return sql
}

// ---------------------------------------------------------------------------
// Copie
// ---------------------------------------------------------------------------

async function colonnesSource(src, q) {
  const lignes = await src.sql(`
    select a.attname as nom from pg_attribute a
    where a.attrelid = ${lit(q)}::regclass and a.attnum > 0 and not a.attisdropped`)
  return lignes.map((l) => l.nom)
}

async function colonnesCible(db, q) {
  const { rows } = await db.query(`
    select a.attname as nom from pg_attribute a
    where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''`, [q])
  return rows.map((l) => l.nom)
}

// Copie une table par paquets. La taille des paquets s'adapte au poids des lignes
// (documents volumineux) pour ne jamais demander trop d'un coup au serveur.
async function copierTable(src, db, q, colonnesSrc, adapter = (cols, r) => (r === null ? cols : r)) {
  suivi.etape = `Copie de ${q}`
  suivi.detail = ''
  const cible = await colonnesCible(db, q)
  const colsNoms = adapter(cible.filter((col) => colonnesSrc.includes(col)), null)
  const cols = colsNoms.map(qid).join(', ')
  const CIBLE_OCTETS = 2 * 1024 * 1024
  let curseur = '(0,0)'
  let total = 0
  let taille = 50
  let plafond = 500 // taille maximale autorisée pour cette table (abaissée si le serveur a dû être ménagé)
  let echecsLigne = 0 // essais successifs sur une seule ligne qui ne répond pas
  for (;;) {
    let lignes
    let octets
    suivi.paquet = taille
    try {
      lignes = await src.sql(`
        select t.ctid::text as _ctid, to_jsonb(t) as r from ${q} t
        where t.ctid > ${lit(curseur)}::tid order by t.ctid limit ${taille}`)
      octets = JSON.stringify(lignes).length
      echecsLigne = 0
      reglage.delaiMs = DELAI_REQUETE_MS
      suivi.note = ''
    } catch (e) {
      if (taille > 1) {
        // Ce paquet n'a pas été servi à temps : on ne remontera plus au-dessus pour cette table.
        plafond = Math.max(1, Math.floor(taille / 4))
        taille = plafond
        process.stdout.write(`\n  Serveur lent (${e.message}) : paquets réduits à ${taille} ligne(s)\n`)
        continue
      }
      if (!e.lent) throw new Error(`Lecture de ${q} impossible : ${e.message}`)
      // Une seule ligne ne répond pas : on laisse au serveur plus de temps, quelques fois, avant d'abandonner.
      echecsLigne += 1
      if (echecsLigne > ESSAIS_LIGNE) {
        throw new Error(
          `Lecture de ${q} bloquée sur la ligne qui suit ${curseur} : le serveur ne répond pas pour cette ligne, ` +
          `même après ${ESSAIS_LIGNE} essais (dernier délai : ${Math.round(reglage.delaiMs / 1000)} s). ` +
          `Relancez l'export plus tard : il reprend à cet endroit. ` +
          `Pour voir la ligne sur le serveur (lecture seule) : select ctid, pg_column_size(t.*) as octets from ${q} t where t.ctid > '${curseur}'::tid order by t.ctid limit 1;`)
      }
      reglage.delaiMs = Math.min(15 * 60_000, DELAI_REQUETE_MS * 2 ** echecsLigne)
      suivi.note = `Ligne bloquée après ${curseur} : essai ${echecsLigne}/${ESSAIS_LIGNE}, délai porté à ${Math.round(reglage.delaiMs / 1000)} s`
      process.stdout.write(`\n  ${suivi.note}\n`)
      continue
    }
    if (!lignes.length) break
    await db.query(
      `insert into ${q} (${cols}) overriding system value select ${cols} from jsonb_populate_recordset(null::${q}, $1::jsonb)`,
      [JSON.stringify(lignes.map((l) => adapter(colsNoms, l.r)))])
    total += lignes.length
    suivi.lignes += lignes.length
    curseur = lignes[lignes.length - 1]._ctid
    // Après un paquet réussi, le plafond remonte (x2) : une coupure ponctuelle ne ralentit pas tout l'export.
    plafond = Math.min(500, plafond * 2)
    // Ajuste le prochain paquet pour viser environ 2 Mo (un paquet court = reprise plus fine après coupure)
    const parLigne = Math.max(1, octets / lignes.length)
    taille = Math.max(1, Math.min(plafond, Math.floor(CIBLE_OCTETS / parLigne)))
    suivi.detail = `${total} ligne(s)`
    process.stdout.write(`    ${q} : ${total} ligne(s)\n`)
  }
  process.stdout.write(`    ${q} : ${total} ligne(s), terminé\n`)
  return total
}

// Anciennes versions de Supabase : auth.identities sans colonne provider_id.
function adapterIdentites(colonnesSrc) {
  if (colonnesSrc.includes('provider_id')) return undefined
  return (cols, r) => {
    if (r === null) return [...cols.filter((c) => c !== 'id'), 'provider_id']
    return { ...r, provider_id: r.identity_data?.sub ?? r.id, id: undefined }
  }
}

async function compter(src, q) {
  const [r] = await src.sql(`select count(*)::int as n from ${q}`)
  return r.n
}

// En-tête Cache-Control à rejouer pour un fichier, d'après ses métadonnées d'origine.
function cacheControlDe(valeur) {
  if (!valeur) return 'max-age=3600'
  const texte = String(valeur).trim()
  return /^\d+$/.test(texte) ? `max-age=${texte}` : texte
}

async function migrer(sourceHorsLigne = null) {
  if (!sourceHorsLigne && fs.existsSync(MARQUEUR)) {
    dire(c.ok('La migration a déjà été faite sur cet ordinateur. Rien à refaire.'))
    return
  }
  const { default: pg } = await import('pg')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  dire()
  dire(c.titre('=============================================================='))
  dire(c.titre('   Récupération de vos données depuis le serveur actuel'))
  dire(c.titre('=============================================================='))
  dire('Je vais vous poser 2 questions, puis tout se fera automatiquement.')
  dire('Le serveur actuel est seulement lu : rien n\'y est modifié ni supprimé.')
  dire()

  const src = sourceHorsLigne || await questions(rl)

  dire()
  dire('Analyse de votre base actuelle...')
  const structure = await lireStructure(src)
  const nbUtilisateurs = await compter(src, 'auth.users')
  const fichiers = await src.sql(`select * from storage.objects order by bucket_id, name`)
  const lignesParTable = {}
  for (const t of structure.tables) lignesParTable[t.q] = await compter(src, t.q)
  const totalLignes = Object.values(lignesParTable).reduce((a, b) => a + b, 0)

  dire()
  dire(c.gras('Voici ce qui va être copié sur cet ordinateur :'))
  dire(`  - ${nbUtilisateurs} compte(s) utilisateur (avec leurs mots de passe)`)
  dire(`  - ${structure.tables.length} table(s), ${totalLignes} ligne(s) au total`)
  dire(`  - ${fichiers.length} fichier(s) (documents envoyés)`)
  if (structure.autresSchemas.length) {
    dire(c.err(`  Attention : les schémas ${structure.autresSchemas.join(', ')} ne seront pas copiés.`))
  }
  dire()
  const ok = sourceHorsLigne ? 'oui' : await demander(rl, 'Tapez OUI puis Entrée pour lancer la copie : ')
  rl.close()
  if (ok.toLowerCase() !== 'oui') {
    dire('Copie annulée. Recollez la commande d\'installation quand vous voudrez.')
    process.exit(1)
  }

  const db = new pg.Client({
    host: 'db', port: 5432, database: 'postgres', user: 'supabase_admin',
    password: process.env.POSTGRES_PASSWORD,
  })
  await db.connect()

  // 1. Structure + données en une seule transaction : en cas d'erreur, rien n'est gardé.
  dire()
  demarrerSuivi()
  suivi.etape = '1/3 Structure et données'
  dire('1/3  Copie de la structure et des données...')
  if (!sourceHorsLigne && fs.existsSync(ETAPE1)) {
    dire(c.ok('     Déjà faite lors d\'un essai précédent.'))
  } else try {
    await db.query('begin')
    await db.query("set local check_function_bodies = off; set local session_replication_role = replica; set local search_path = public, extensions")
    if (sourceHorsLigne) {
      await db.query('drop schema public cascade; create schema public; grant usage on schema public to public; grant all on schema public to postgres, service_role')
      await db.query('truncate auth.users, auth.identities, storage.objects, storage.buckets cascade')
      // Politiques RLS du schéma storage : recréées depuis la source à chaque import.
      // Sans cela, une relance échoue avec « policy ... already exists ».
      await db.query(`do $$ declare r record; begin
        for r in select policyname, schemaname, tablename from pg_policies where schemaname = 'storage' loop
          execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
        end loop; end $$`)
    }
    for (const e of structure.extensions) {
      await db.query('savepoint ext')
      try {
        await db.query(`create extension if not exists ${qid(e.nom)} with schema ${qid(e.schema)}`)
      } catch {
        await db.query('rollback to savepoint ext')
      }
    }
    // Les objets dépendent parfois les uns des autres dans un ordre imprévisible :
    // on rejoue les instructions en échec tant qu'il y a du progrès.
    suivi.etape = 'Recréation de la structure'
    suivi.detail = ''
    let restantes = scriptStructure(structure)
    let derniereErreur = new Map()
    while (restantes.length) {
      const echecs = []
      for (const instruction of restantes) {
        await db.query('savepoint instr')
        try {
          await db.query(instruction)
          await db.query('release savepoint instr')
        } catch (e) {
          await db.query('rollback to savepoint instr')
          echecs.push(instruction)
          derniereErreur.set(instruction, e.message)
        }
      }
      if (echecs.length === restantes.length) {
        const detail = echecs.slice(0, 3).map((i) => `${derniereErreur.get(i)}\n   -> ${i.slice(0, 300)}`).join('\n')
        throw new Error(`${echecs.length} élément(s) de structure n'ont pas pu être recréés :\n${detail}`)
      }
      restantes = echecs
    }

    // Comptes utilisateurs (mots de passe chiffrés inclus), puis buckets, puis données de l'app.
    for (const q of ['auth.users', 'auth.identities', 'storage.buckets']) {
      const colsSrc = await colonnesSource(src, q)
      await copierTable(src, db, q, colsSrc, q === 'auth.identities' ? adapterIdentites(colsSrc) : undefined)
    }
    for (const t of structure.tables) {
      await copierTable(src, db, t.q, t.colonnes.map((col) => col.nom))
    }

    // Compteurs (séquences et colonnes auto-incrémentées)
    for (const q of structure.sequences) {
      if (q.valeur !== null) await db.query(`select setval(${lit(q.q)}, ${q.valeur}, true)`)
    }
    for (const t of structure.tables) {
      for (const col of t.colonnes.filter((x) => x.identite)) {
        await db.query(`select setval(pg_get_serial_sequence(${lit(t.q)}, ${lit(col.nom)}), coalesce(max(${col.q}), 1), max(${col.q}) is not null) from ${t.q}`)
      }
    }
    for (const v of structure.vues.filter((x) => x.type === 'm')) await db.query(`refresh materialized view ${v.q}`)
    await db.query('commit')
    fs.writeFileSync(ETAPE1, new Date().toISOString())
    dire(c.ok('     Structure et données copiées.'))
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }

  // 2. Fichiers
  suivi.etape = '2/3 Fichiers'
  dire('2/3  Copie des fichiers...')
  const service = process.env.SERVICE_ROLE_KEY
  const echecs = []
  for (const [i, f] of fichiers.entries()) {
    try {
      const contenu = await src.telecharger(f.bucket_id, f.name)
      const chemin = f.name.split('/').map(encodeURIComponent).join('/')
      const rep = await fetch(`http://storage:5000/object/${encodeURIComponent(f.bucket_id)}/${chemin}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${service}`,
          'x-upsert': 'true',
          'Content-Type': f.metadata?.mimetype || 'application/octet-stream',
          // Le stockage garde parfois « 3600 », parfois « max-age=3600 » : on ne préfixe que les nombres.
          'Cache-Control': cacheControlDe(f.metadata?.cacheControl),
        },
        body: contenu,
      })
      if (!rep.ok) throw new Error(`envoi refusé (${rep.status}) : ${(await rep.text()).slice(0, 200)}`)
    } catch (e) {
      echecs.push(`${f.bucket_id}/${f.name} : ${e.message}`)
    }
    suivi.detail = `${i + 1}/${fichiers.length} fichier(s)`
    process.stdout.write(`     ${i + 1}/${fichiers.length} fichier(s)\n`)
  }
  // Propriétaires des fichiers (servent aux règles d'accès)
  const colsObjets = await colonnesCible(db, 'storage.objects')
  const majProprio = ['owner', 'owner_id'].filter((col) => colsObjets.includes(col) && fichiers[0] && col in fichiers[0])
  if (majProprio.length && fichiers.length) {
    const sets = majProprio.map((col) => (col === 'owner' ? 'owner = (x->>\'owner\')::uuid' : 'owner_id = x->>\'owner_id\'')).join(', ')
    await db.query(
      `update storage.objects o set ${sets} from jsonb_array_elements($1::jsonb) x
       where o.bucket_id = x->>'bucket_id' and o.name = x->>'name'`,
      [JSON.stringify(fichiers.map((f) => ({ bucket_id: f.bucket_id, name: f.name, owner: f.owner, owner_id: f.owner_id })))])
  }

  // 3. Vérification
  suivi.etape = '3/3 Vérification'
  suivi.detail = ''
  dire('3/3  Vérification...')
  const problemes = []
  const verifier = async (q, attendu) => {
    const { rows } = await db.query(`select count(*)::int as n from ${q}`)
    if (rows[0].n !== attendu) problemes.push(`${q} : ${rows[0].n} au lieu de ${attendu}`)
  }
  await verifier('auth.users', nbUtilisateurs)
  for (const t of structure.tables) await verifier(t.q, lignesParTable[t.q])
  await verifier('storage.objects', fichiers.length)
  // L'API garde en mémoire la liste des tables : on lui demande de la relire.
  await db.query("notify pgrst, 'reload schema'")
  await db.end()
  arreterSuivi()

  dire()
  if (echecs.length || problemes.length) {
    dire(c.err('La copie est terminée mais certains éléments n\'ont pas pu être copiés :'))
    for (const x of [...problemes, ...echecs]) dire(c.err(`  - ${x}`))
    dire('Faites une capture de cette fenêtre et envoyez-la à votre prestataire.')
    fs.writeFileSync(path.join(PROJET, 'rapport-migration.txt'), [...problemes, ...echecs].join('\r\n'))
    process.exit(2)
  }
  fs.writeFileSync(MARQUEUR, new Date().toISOString())
  dire(c.ok('Tout a été copié avec succès !'))
  dire(c.ok(`  ${nbUtilisateurs} compte(s), ${totalLignes} ligne(s), ${fichiers.length} fichier(s).`))
}

// ---------------------------------------------------------------------------

export { questions, lireStructure, colonnesSource, copierTable, compter, migrer }
const action = process.argv[2]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
try {
  if (action === 'init') init()
  else if (action === 'migrer') await migrer()
  else { dire('Usage : node assistant.mjs init|migrer'); process.exit(1) }
} catch (e) {
  dire()
  dire(c.err('Une erreur est survenue :'))
  dire(c.err(e.message))
  dire()
  dire('Rien n\'a été abîmé. Faites une capture de cette fenêtre et envoyez-la')
  dire('à votre prestataire, ou recollez la commande d\'installation pour réessayer.')
  process.exit(1)
}
}

