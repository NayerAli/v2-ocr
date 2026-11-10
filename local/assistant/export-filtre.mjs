// Export filtré par compte, uniquement par l'API Supabase (/pg/query et /storage/v1).
// Aucune connexion au port PostgreSQL. Prévu pour un conteneur Docker jetable lancé
// depuis Windows (exporter-filtre.ps1). Le serveur source est seulement lu.
//
//   node export-filtre.mjs <dossier de sortie> [--config selection.json] [--ecrire-config selection.json] [--oui]
//
// Produit <dossier>/payload (archive « ocr-offline-1 », lisible par archive.mjs import)
// et <dossier>/rapport-filtrage.txt (contient des adresses e-mail : ne pas diffuser).

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { questions, lireStructure, colonnesSource, copierTable, compter, demarrerSuivi, arreterSuivi, suivi } from './assistant.mjs'
import { ArchiveSource } from './archive.mjs'

const digest = (valeur) => crypto.createHash('sha256').update(valeur).digest('hex')
const cleRequete = (texte) => digest(texte.trim().replace(/\r\n/g, '\n'))
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const qid = (s) => `"${String(s).replace(/"/g, '""')}"`
const dire = (s = '') => console.log(s)
const masquer = (v) => (v.length <= 8 ? '****' : `${v.slice(0, 4)}...${v.slice(-4)}`)

// Clés fournisseurs : nom de champ sensible, ou valeur de forme « AIza... » (Google).
const MOTIF_CLE = '"(apikey|api_key|secret|token|password|private_key)"\\s*:|AIza[0-9A-Za-z_-]{35}'
const NOMS_CLE = /^(apikey|api_key|secret|token|password|private_key)$/i
const LISTE_TOUS = '(SELECT u.id::text FROM auth.users u)'
const COLONNES_COMPTE = ['user_id', 'owner', 'owner_id']

// État du filtre, construit une fois la structure lue.
let INFOS = new Map()          // table -> { colonnes, directes, fks }
let REFS_FICHIERS = []         // colonnes « *path » des tables liées (nom d'objet Storage)
let COPIE = []                 // tables copiées dans l'archive (même ordre qu'archive.mjs)
let SEL_LISTE = '(NULL::text)' // liste SQL des comptes choisis
let DECISIONS = { orphelins: {}, globales: { 'storage.buckets': true }, cles: {} }
let CLE_TROUVEE = new Map()    // table -> nombre de lignes hors compte contenant une clé

// Prédicat SQL « la ligne appartient à la liste de comptes ».
// Liens : colonnes FK vers auth.users, colonnes user_id/owner/owner_id, enfants par clés étrangères,
// et pour Storage : premier segment du nom = compte, ou nom égal à un chemin de fichier d'une ligne liée.
function predicat(q, a, liste, pile = []) {
  if (q === 'auth.users') return `${a}.id::text IN ${liste}`
  const info = INFOS.get(q)
  if (!info) return null
  const parties = info.directes.map((col) => `${a}.${qid(col)}::text IN ${liste}`)
  if (q === 'storage.objects') {
    parties.push(`split_part(${a}.name, '/', 1) IN ${liste}`)
    for (const r of REFS_FICHIERS) {
      const sous = predicat(r.table, 'r', liste, [...pile, q])
      if (sous) parties.push(`${a}.name IN (SELECT r.${qid(r.col)} FROM ${r.table} r WHERE ${sous})`)
    }
  }
  if (!pile.includes(q)) {
    info.fks.forEach((fk, i) => {
      if (fk.parent === 'storage.buckets' || pile.includes(fk.parent) || fk.parent === q) return
      const b = `${a}p${pile.length}x${i}`
      const sous = predicat(fk.parent, b, liste, [...pile, q])
      if (sous) parties.push(`${a}.${qid(fk.col)}::text IN (SELECT ${b}.${qid(fk.pcol)}::text FROM ${fk.parent} ${b} WHERE ${sous})`)
    })
  }
  return parties.length ? `(${parties.join(' OR ')})` : null
}

// Prédicat de copie : lignes des comptes choisis, plus les lignes sans compte si la décision le prévoit.
function predicatCopie(q, a) {
  const sel = predicat(q, a, SEL_LISTE)
  const tous = q === 'storage.buckets' ? null : predicat(q, a, LISTE_TOUS)
  const morceaux = []
  if (sel) morceaux.push(`COALESCE(${sel}, false)`)
  const inclure = tous ? DECISIONS.orphelins[q] === true : DECISIONS.globales[q] === true
  const bloque = CLE_TROUVEE.has(q) && !DECISIONS.cles[q]
  if (inclure && !bloque) morceaux.push(tous ? `NOT COALESCE(${tous}, false)` : 'TRUE')
  return morceaux.length ? `(${morceaux.join(' OR ')})` : 'FALSE'
}

// Lignes sans compte ni fichier rattaché (ou tables sans lien du tout).
function condSansCompte(q) {
  const tous = q === 'storage.buckets' ? null : predicat(q, 't', LISTE_TOUS)
  return tous ? `NOT COALESCE(${tous}, false)` : 'true'
}

// Compte les lignes de plusieurs tables en une seule requête.
async function compterUnion(remote, items) {
  if (!items.length) return new Map()
  const sql = items.map(({ nom, cond, octets }) => {
    const taille = octets
      ? `coalesce(sum(case when t.metadata->>'size' ~ '^[0-9]+$' then (t.metadata->>'size')::bigint end), 0)::text`
      : `'0'`
    return `select ${lit(nom)} as t, count(*)::int as n, ${taille} as octets from ${nom} t where ${cond}`
  }).join(' union all ')
  const lignes = await remote.sql(sql)
  return new Map(lignes.map((l) => [l.t, { n: l.n, octets: Number(l.octets) }]))
}

function parserChoix(saisie, n) {
  const s = saisie.trim().toLowerCase()
  if (s === 'aucun') return []
  if (s === 'tous' || s === 'toutes') return [...Array(n).keys()]
  const choix = new Set()
  for (const morceau of s.split(/[\s,;]+/).filter(Boolean)) {
    const plage = /^(\d+)-(\d+)$/.exec(morceau)
    if (plage) {
      for (let i = Number(plage[1]); i <= Number(plage[2]); i++) if (i >= 1 && i <= n) choix.add(i - 1)
    } else if (/^\d+$/.test(morceau) && Number(morceau) >= 1 && Number(morceau) <= n) {
      choix.add(Number(morceau) - 1)
    } else {
      throw new Error(`Numéro invalide : ${morceau}`)
    }
  }
  return [...choix].sort((x, y) => x - y)
}

async function ouiNon(rl, question, defaut = false) {
  const reponse = (await rl.question(`${question} ${defaut ? '[O/n]' : '[o/N]'} : `)).trim().toLowerCase()
  if (!reponse) return defaut
  return ['o', 'oui', 'y', 'yes'].includes(reponse)
}

// Clés trouvées dans le JSON d'une ligne (ne sont jamais affichées en entier).
function extraireCles(noeud, sortie = []) {
  if (Array.isArray(noeud)) { for (const x of noeud) extraireCles(x, sortie); return sortie }
  if (noeud && typeof noeud === 'object') {
    for (const [nom, v] of Object.entries(noeud)) {
      if (NOMS_CLE.test(nom) && typeof v === 'string' && v.length >= 8) sortie.push({ nom, valeur: v })
      else extraireCles(v, sortie)
    }
  } else if (typeof noeud === 'string') {
    for (const m of noeud.matchAll(/AIza[0-9A-Za-z_-]{35}/g)) sortie.push({ nom: 'clé Google (AIza)', valeur: m[0] })
  }
  return sortie
}

async function lignesAvecCle(remote, q, cond, limite = null) {
  return remote.sql(`select to_jsonb(t)::text as j from ${q} t where ${cond} and (to_jsonb(t)::text ~* ${lit(MOTIF_CLE)})${limite ? ` limit ${limite}` : ''}`)
}

// Valeurs de clés présentes dans les comptes (condPour(table) = condition supplémentaire sur la table).
async function valeursCles(remote, condPour) {
  const valeurs = new Set()
  for (const q of COPIE) {
    if (q === 'auth.users' || q === 'storage.buckets') continue
    const tous = predicat(q, 't', LISTE_TOUS)
    if (!tous) continue
    for (const l of await lignesAvecCle(remote, q, `COALESCE(${tous}, false) and ${condPour(q)}`)) {
      for (const c of extraireCles(JSON.parse(l.j))) valeurs.add(c.valeur)
    }
  }
  return valeurs
}

async function principal() {
  const argv = process.argv.slice(2)
  const valeur = (nom) => { const i = argv.indexOf(nom); return i >= 0 ? argv[i + 1] : null }
  const dossierArg = valeur('--sortie') || (argv[0] && !argv[0].startsWith('--') ? argv[0] : null)
  if (!dossierArg) throw new Error('Usage : node export-filtre.mjs <dossier de sortie> [--config selection.json] [--ecrire-config selection.json] [--oui]')
  const dossier = path.resolve(dossierArg)
  const fichierConfig = valeur('--config')
  const fichierEcriture = valeur('--ecrire-config')
  const sansQuestion = argv.includes('--oui')
  const config = fichierConfig ? JSON.parse(fs.readFileSync(fichierConfig, 'utf8')) : null
  fs.mkdirSync(dossier, { recursive: true })

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    dire('=== Export filtré par compte (API Supabase, port 8000 seulement) ===')
    dire('Le serveur est seulement lu. Une ligne d\'état s\'affiche toutes les 15 s pendant la copie.')
    dire()
    const remote = await questions(rl)

    // 1. Structure et liens
    const structure = await lireStructure(remote)
    const speciales = await remote.sql("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('p','f')")
    if (speciales.length) throw new Error('Tables partitionnees ou etrangeres non prises en charge : ' + speciales.map((t) => t.relname).join(', '))
    if (structure.autresSchemas.length) throw new Error('Schemas supplementaires non pris en charge : ' + structure.autresSchemas.join(', '))
    COPIE = ['auth.users', 'auth.identities', 'storage.buckets', ...structure.tables.map((t) => t.q)]
    INFOS = new Map()
    for (const q of [...COPIE, 'storage.objects']) {
      if (q === 'storage.buckets') { INFOS.set(q, { colonnes: [], directes: [], fks: [] }); continue }
      const pub = structure.tables.find((t) => t.q === q)
      const colonnes = pub
        ? pub.colonnes.map((c) => ({ nom: c.nom, type: c.type }))
        : (await colonnesSource(remote, q)).map((nom) => ({ nom, type: '' }))
      INFOS.set(q, { colonnes, directes: colonnes.filter((c) => COLONNES_COMPTE.includes(c.nom)).map((c) => c.nom), fks: [] })
    }
    const fks = await remote.sql(`select quote_ident(ns.nspname) || '.' || quote_ident(cl.relname) as enfant, a.attname as col,
        quote_ident(np.nspname) || '.' || quote_ident(cp.relname) as parent, ap.attname as pcol
      from pg_constraint k
      join pg_class cl on cl.oid = k.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_class cp on cp.oid = k.confrelid join pg_namespace np on np.oid = cp.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      join pg_attribute ap on ap.attrelid = k.confrelid and ap.attnum = k.confkey[1]
      where k.contype = 'f' and cardinality(k.conkey) = 1`)
    for (const fk of fks) {
      const enfant = INFOS.get(fk.enfant)
      if (!enfant) continue
      if (fk.parent === 'auth.users') { if (!enfant.directes.includes(fk.col)) enfant.directes.push(fk.col) }
      else if (INFOS.has(fk.parent)) enfant.fks.push({ col: fk.col, parent: fk.parent, pcol: fk.pcol })
    }
    REFS_FICHIERS = []
    for (const t of structure.tables) {
      for (const c of t.colonnes) if (/path$/i.test(c.nom) && /^(text|character varying)/.test(c.type)) REFS_FICHIERS.push({ table: t.q, col: c.nom })
    }

    // 2. Comptes et choix
    const comptes = await remote.sql('select id::text as id, email, created_at::text as cree from auth.users order by created_at, email')
    if (!comptes.length) throw new Error('Aucun compte dans auth.users')
    dire()
    dire(`Comptes sur le serveur (${comptes.length}) : lignes liées et fichiers Storage de chaque compte`)
    for (const [i, cpt] of comptes.entries()) {
      const items = []
      for (const q of [...COPIE, 'storage.objects']) {
        if (q === 'storage.buckets') continue
        const sel = predicat(q, 't', `(${lit(cpt.id)})`)
        if (sel) items.push({ nom: q, cond: `COALESCE(${sel}, false)`, octets: q === 'storage.objects' })
      }
      const v = await compterUnion(remote, items)
      const lignes = [...v.entries()].filter(([q]) => q !== 'storage.objects').reduce((a, [, x]) => a + x.n, 0)
      const fichiers = v.get('storage.objects') ?? { n: 0, octets: 0 }
      dire(`  ${String(i + 1).padStart(2)}. ${cpt.email}  (créé ${cpt.cree?.slice(0, 10) ?? '?'})  ${lignes} ligne(s), ${fichiers.n} fichier(s) (${(fichiers.octets / 1048576).toFixed(1)} Mo)`)
    }
    let indices = null
    if (config) {
      indices = comptes.map((c, i) => ((config.comptes || []).includes(c.email) ? i : -1)).filter((i) => i >= 0)
      dire(`Sélection rejouée depuis ${fichierConfig} : ${indices.length} compte(s).`)
    } else {
      while (indices === null) {
        const saisie = (await rl.question('Numéros à exporter (ex. 1,3,5-8), « tous », « aucun » : ')).trim()
        if (!saisie) continue
        try { indices = parserChoix(saisie, comptes.length) } catch (e) { dire(e.message) }
      }
    }
    const choisis = indices.map((i) => comptes[i])
    const nonChoisis = comptes.filter((c) => !choisis.includes(c))
    SEL_LISTE = choisis.length ? `(${choisis.map((c) => lit(c.id)).join(',')})` : '(NULL::text)'
    if (!choisis.length) dire('Attention : aucun compte choisi, l\'archive ne contiendra aucune ligne de compte.')
    dire(`Comptes choisis : ${choisis.length}. Non exportés : ${nonChoisis.length} (et leurs lignes et fichiers).`)

    // 3. Lignes sans rattachement clair (ni compte, ni fichier) : listées, décision de l'administrateur
    const itemsSans = [...COPIE, 'storage.objects']
      .filter((q) => q !== 'auth.users')
      .map((q) => ({ nom: q, cond: condSansCompte(q) }))
    const sansCompte = await compterUnion(remote, itemsSans)
    const itemsCles = itemsSans.map((it) => ({ ...it, cond: `(${it.cond}) and (to_jsonb(t)::text ~* ${lit(MOTIF_CLE)})` }))
    for (const [q, x] of await compterUnion(remote, itemsCles)) if (x.n > 0) CLE_TROUVEE.set(q, x.n)

    dire()
    dire('Lignes sans compte ni fichier rattaché (non exportées sauf décision) :')
    let rienASignaler = true
    for (const [q, x] of sansCompte) {
      if (!x.n) continue
      rienASignaler = false
      const defaut = q === 'storage.buckets'
      dire(`  - ${q} : ${x.n} ligne(s)${CLE_TROUVEE.has(q) ? '  [ATTENTION : clé détectée]' : ''}`)
      const inclure = config
        ? (config.globales?.[q] ?? config.orphelins?.[q] ?? defaut)
        : await ouiNon(rl, '    Inclure ces lignes dans l\'export ?', defaut)
      const globale = !predicat(q, 't', LISTE_TOUS)
      if (globale) DECISIONS.globales[q] = inclure === true
      else DECISIONS.orphelins[q] = inclure === true
    }
    if (rienASignaler) dire('  (aucune)')
    for (const [q, n] of CLE_TROUVEE) {
      dire(`  ATTENTION : clé OCR détectée dans ${n} ligne(s) hors compte (${q}). Elle n'est exportée que si vous confirmez.`)
      const exemples = await lignesAvecCle(remote, q, condSansCompte(q), 2)
      for (const l of exemples) for (const c of extraireCles(JSON.parse(l.j)).slice(0, 2)) dire(`    exemple : ${c.nom} = ${masquer(c.valeur)}`)
      const confirme = config ? config.cles?.[q] === true : await ouiNon(rl, `    Exporter les lignes de ${q} contenant cette clé ?`, false)
      DECISIONS.cles[q] = confirme === true
    }

    // 4. Récapitulatif
    const total = await compterUnion(remote, [...COPIE, 'storage.objects']
      .filter((q) => q !== 'auth.users' || choisis.length)
      .map((q) => ({ nom: q, cond: predicatCopie(q, 't'), octets: q === 'storage.objects' })))
    dire()
    dire('=== Récapitulatif ===')
    for (const [q, x] of total) if (x.n) dire(`  ${q} : ${x.n} ligne(s)${q === 'storage.objects' ? ` (${(x.octets / 1048576).toFixed(1)} Mo à télécharger)` : ''}`)
    dire('  Non copiées par conception : auth.sessions et auth.refresh_tokens (les comptes se reconnectent avec leur mot de passe).')
    dire(`  Comptes choisis : ${choisis.map((c) => c.email).join(', ') || '(aucun)'}`)
    if (!sansQuestion) {
      const reponse = (await rl.question('Tapez OUI puis Entrée pour lancer l\'export : ')).trim()
      if (reponse !== 'OUI' && reponse.toLowerCase() !== 'oui') { dire('Export annulé.'); return }
    }
    if (fichierEcriture) {
      fs.writeFileSync(fichierEcriture, JSON.stringify({ version: 1, comptes: choisis.map((c) => c.email), globales: DECISIONS.globales, orphelins: DECISIONS.orphelins, cles: DECISIONS.cles }, null, 2))
      dire(`Sélection enregistrée : ${fichierEcriture}`)
    }

    // 5. Export puis contrôle
    const totalLignes = [...total.entries()].filter(([q]) => q !== 'storage.objects').reduce((a, [, x]) => a + x.n, 0)
    await exporterArchive({ remote, dossier, choisis, nonChoisis, totalLignes, fichiers: total.get('storage.objects') ?? { n: 0, octets: 0 } })
  } finally {
    rl.close()
  }
}

async function exporterArchive({ remote, dossier, choisis, nonChoisis, totalLignes, fichiers }) {
  const payload = path.join(dossier, 'payload')
  if (fs.existsSync(path.join(payload, 'manifest.json'))) throw new Error('Cet export est déjà terminé dans ce dossier')
  const identite = digest(JSON.stringify({ url: remote.url, comptes: choisis.map((c) => c.id), decisions: DECISIONS }))
  const marque = path.join(dossier, 'reprise.json')
  let precedente = null
  try { precedente = JSON.parse(fs.readFileSync(marque, 'utf8')) } catch { /* pas de reprise */ }
  if (precedente && precedente.identite !== identite) {
    dire('Ce dossier contient un export partiel avec un autre choix : on repart de zéro.')
    fs.rmSync(payload, { recursive: true, force: true })
  }
  fs.mkdirSync(payload, { recursive: true })
  fs.writeFileSync(marque, JSON.stringify({ identite }))

  const manifest = {
    format: 'ocr-offline-1',
    created: new Date().toISOString(),
    files: {},
    counts: {},
    filtre: { version: 1, perimetre: 'comptes choisis', comptes: choisis.length, globales: DECISIONS.globales, orphelins: DECISIONS.orphelins, cles_confirmees: DECISIONS.cles },
  }
  const chemin = (nom) => path.join(payload, nom)
  const relire = (nom) => (fs.existsSync(chemin(nom)) ? fs.readFileSync(chemin(nom)) : null)
  const sauver = (nom, valeur) => {
    fs.writeFileSync(`${chemin(nom)}.tmp`, valeur)
    fs.renameSync(`${chemin(nom)}.tmp`, chemin(nom))
    manifest.files[nom] = digest(valeur)
  }
  // Source vue par archive.mjs : chaque réponse est enregistrée sous la clé du texte d'origine,
  // pour que l'import rejoue exactement les mêmes requêtes. La requête envoyée au serveur est filtrée.
  const reecrire = (texte) => {
    const n = texte.replace(/\s+/g, ' ').trim()
    let m = /^select count\(\*\)::int as n from (\S+)$/.exec(n)
    if (m && COPIE.includes(m[1])) return `select count(*)::int as n from ${m[1]} t where ${predicatCopie(m[1], 't')}`
    m = /^select t\.ctid::text as _ctid, to_jsonb\(t\) as r from (\S+) t where t\.ctid > ('[^']*'::tid) order by t\.ctid limit (\d+)$/.exec(n)
    if (m && COPIE.includes(m[1])) return `select t.ctid::text as _ctid, to_jsonb(t) as r from ${m[1]} t where t.ctid > ${m[2]} and ${predicatCopie(m[1], 't')} order by t.ctid limit ${m[3]}`
    if (n === 'select * from storage.objects order by bucket_id, name') {
      return `select * from storage.objects t where ${predicatCopie('storage.objects', 't')} order by bucket_id, name`
    }
    return texte
  }
  const src = {
    sql: async (texte) => {
      const nom = cleRequete(texte) + '.json'
      const existant = relire(nom)
      if (existant) {
        try { const rows = JSON.parse(existant); manifest.files[nom] = digest(existant); return rows } catch { /* écriture interrompue : on redemande */ }
      }
      const rows = await remote.sql(reecrire(texte))
      sauver(nom, JSON.stringify(rows))
      return rows
    },
  }

  dire('Export en cours. Ne modifiez pas les données du serveur pendant la copie.')
  demarrerSuivi()
  suivi.etape = 'Lecture de la structure'
  suivi.lignes = 0
  suivi.lignesTotales = totalLignes
  try {
    await lireStructure(src)
    await src.sql('select * from storage.objects order by bucket_id, name')
    for (const table of COPIE) {
      suivi.etape = `Copie de ${table}`
      const colonnes = await colonnesSource(src, table)
      const sink = { query: async () => ({ rows: colonnes.map((nom) => ({ nom })) }) }
      const copies = await copierTable(src, sink, table, colonnes)
      const attendu = await compter(src, table)
      if (copies !== attendu) throw new Error(`La table ${table} ne correspond pas au filtre : ${copies} copiée(s), ${attendu} attendue(s)`)
      manifest.counts[table] = copies
    }
    suivi.etape = 'Fichiers Storage'
    const objets = await src.sql('select * from storage.objects order by bucket_id, name')
    for (const [i, objet] of objets.entries()) {
      const nom = digest(JSON.stringify([objet.bucket_id, objet.name])) + '.bin'
      suivi.detail = `${i + 1}/${objets.length} fichier(s) : ${objet.bucket_id}/${objet.name}`
      if (!relire(nom)) sauver(nom, await remote.telecharger(objet.bucket_id, objet.name))
    }
    suivi.detail = ''
    fs.writeFileSync(path.join(dossier, 'fichiers.tsv'), objets.map((o) => `${o.bucket_id}\t${o.name}\t${o.metadata?.size ?? ''}`).join('\n') + (objets.length ? '\n' : ''))
    fs.writeFileSync(path.join(payload, 'manifest.json'), JSON.stringify(manifest, null, 2))
    new ArchiveSource(payload)
  } finally {
    arreterSuivi()
  }
  dire('Archive écrite et vérifiée (empreintes des fichiers).')

  // Contrôle : rien d'un compte non choisi dans l'archive ; les clés des comptes choisis y sont.
  const contenus = fs.readdirSync(payload).filter((f) => /\.(json|bin)$/.test(f)).map((f) => fs.readFileSync(chemin(f)))
  const interdits = new Map()
  for (const cpt of nonChoisis) {
    interdits.set(cpt.id, `identifiant d'un compte non choisi`)
    interdits.set(`"${cpt.email}"`, `e-mail d'un compte non choisi`)
  }
  for (const v of await valeursCles(remote, (q) => { const sel = predicat(q, 't', SEL_LISTE); return sel ? `NOT COALESCE(${sel}, false)` : 'true' })) {
    interdits.set(`"${v}"`, 'clé d\'un compte non choisi')
  }
  let fuites = 0
  for (const [motif, libelle] of interdits) {
    if (contenus.some((buf) => buf.includes(Buffer.from(motif)))) { fuites++; dire(`  ECHEC : ${libelle} présent dans l'archive`) }
  }
  let absentes = 0
  for (const v of await valeursCles(remote, (q) => { const sel = predicat(q, 't', SEL_LISTE); return sel ? `COALESCE(${sel}, false)` : 'false' })) {
    if (!contenus.some((buf) => buf.includes(Buffer.from(`"${v}"`)))) absentes++
  }
  for (const cpt of choisis) if (!contenus.some((buf) => buf.includes(Buffer.from(cpt.id)))) absentes++
  if (fuites || absentes) throw new Error(`Contrôle échoué : ${fuites} fuite(s) d'un compte non choisi, ${absentes} élément(s) d'un compte choisi absent(s). Export non valide.`)

  // Rapport (hors archive : il contient des adresses e-mail)
  const lignes = [
    'RAPPORT D\'EXPORT FILTRÉ PAR COMPTE',
    `Date : ${new Date().toISOString()}`,
    `Comptes exportés : ${choisis.length}`,
    `Comptes non exportés : ${nonChoisis.length}`,
    `Lignes copiées : ${totalLignes}`,
    `Fichiers Storage : ${fichiers.n} (${(fichiers.octets / 1048576).toFixed(1)} Mo)`,
    '',
    'Tables (lignes copiées) :',
    ...Object.entries(manifest.counts).filter(([, n]) => n).map(([t, n]) => `  ${t} : ${n}`),
    '',
    'Comptes exportés :',
    ...choisis.map((c) => `  ${c.email}`),
    '',
    'Contrôle : aucune donnée d\'un compte non choisi dans l\'archive (identifiants, e-mails, clés) : OK',
  ]
  if (CLE_TROUVEE.size) {
    lignes.push('', 'ATTENTION : clés détectées hors compte (lignes non rattachées à un compte) :')
    for (const [q, n] of CLE_TROUVEE) lignes.push(`  ${q} : ${n} ligne(s), exportées : ${DECISIONS.cles[q] ? 'oui (confirmé)' : 'non'}`)
  }
  fs.writeFileSync(path.join(dossier, 'rapport-filtrage.txt'), lignes.join('\n') + '\n')
  dire(`Rapport : ${path.join(dossier, 'rapport-filtrage.txt')}`)
  dire(`Archive : ${payload}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}

export { predicat, predicatCopie }
