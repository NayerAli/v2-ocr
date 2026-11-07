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
  async sql(requete) {
    const texte = `set local transaction read only; set local search_path = pg_catalog; ${requete}`
    const [adresse, entetes] = this.basic
      ? [`${this.url}/api/platform/pg-meta/default/query`, { Authorization: `Basic ${this.basic}` }]
      : [`${this.url}/pg/query`, this.entetesCle()]
    let rep
    try {
      rep = await fetch(adresse, {
        method: 'POST',
        headers: { ...entetes, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: texte }),
      })
    } catch (e) {
      throw new ErreurAcces('reseau', e.cause?.message || e.message)
    }
    const corps = await rep.text()
    if (!rep.ok) {
      let detail = corps
      try { detail = JSON.parse(corps).error || JSON.parse(corps).message || corps } catch {}
      if (rep.status === 401 || rep.status === 403) throw new ErreurAcces('refus', detail)
      if (rep.status === 404) throw new ErreurAcces('absent', detail)
      throw new Error(`Erreur SQL sur l'ancien serveur (${rep.status}) : ${detail}`)
    }
    const json = JSON.parse(corps)
    return Array.isArray(json) ? json : json.result ?? json
  }

  async telecharger(bucket, nom) {
    const chemin = nom.split('/').map(encodeURIComponent).join('/')
    const rep = await fetch(`${this.url}/storage/v1/object/${encodeURIComponent(bucket)}/${chemin}`, {
      headers: this.entetesCle(),
    })
    if (!rep.ok) throw new Error(`téléchargement refusé (${rep.status}) : ${(await rep.text()).slice(0, 200)}`)
    return Buffer.from(await rep.arrayBuffer())
  }
}

class ErreurAcces extends Error {
  constructor(type, detail) {
    super(detail)
    this.type = type
  }
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
  dire(c.titre('Question 1 sur 2 : l\'adresse de votre Supabase actuel'))
  dire('C\'est l\'adresse que vous tapez dans votre navigateur pour ouvrir')
  dire('le tableau de bord Supabase sur le serveur actuel.')
  dire('Exemples : http://51.68.12.34:8000   ou   https://supabase.mon-site.fr')
  dire()

  let url
  for (;;) {
    const saisie = await demander(rl, 'Adresse : ')
    try {
      url = nettoyerUrl(saisie)
      const rep = await fetch(`${url}/auth/v1/health`).catch((e) => { throw new Error(e.cause?.message || e.message) })
      if (rep.status >= 500) throw new Error(`le serveur répond avec une erreur ${rep.status}`)
      dire(c.ok(`  Serveur trouvé : ${url}`))
      break
    } catch (e) {
      dire(c.err(`  Impossible de joindre cette adresse (${e.message}).`))
      dire('  Vérifiez-la (copiez-la depuis la barre d\'adresse du navigateur) puis réessayez.')
    }
  }

  dire()
  dire(c.titre('Question 2 sur 2 : la clé « service_role »'))
  dire('  1. Ouvrez le tableau de bord Supabase à l\'adresse ci-dessus.')
  dire('  2. En bas à gauche, cliquez sur la roue dentée (« Project Settings »).')
  dire('  3. Dans le menu, cliquez sur « API Keys » (ou « API » selon la version).')
  dire('  4. S\'il y a des onglets, choisissez « Legacy anon, service_role API keys ».')
  dire('  5. Sur la ligne « service_role » (étiquette rouge « secret »), cliquez sur')
  dire('     « Reveal », puis sur « Copy ».')
  dire('  6. Revenez dans cette fenêtre, faites un clic droit (ou Ctrl+V) pour coller,')
  dire('     puis appuyez sur Entrée.')
  dire()

  const ancien = new AncienSupabase(url, '')
  for (;;) {
    const cle = (await demander(rl, 'Clé service_role : ')).replace(/\s+/g, '')
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
    try {
      await ancien.sql('select 1 as ok')
      dire(c.ok('  Clé acceptée.'))
      return ancien
    } catch (e) {
      if (e.type === 'refus') {
        dire(c.err('  Le serveur refuse cette clé. Vérifiez que vous avez copié la clé « service_role » de CE serveur.'))
        continue
      }
      if (e.type === 'absent') {
        // Le serveur n'expose pas l'accès SQL direct : on passe par le tableau de bord.
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

  for (const t of tables) t.colonnes = colonnes.filter((col) => col.oid === t.oid)
  return { tables, contraintes, index, sequences, fonctions, types, vues, politiques,
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

async function copierTable(src, db, q, colonnesSrc) {
  const cible = await colonnesCible(db, q)
  const cols = cible.filter((col) => colonnesSrc.includes(col)).map(qid).join(', ')
  let curseur = '(0,0)'
  let total = 0
  let taille = 100
  for (;;) {
    let lignes
    try {
      lignes = await src.sql(`
        select t.ctid::text as _ctid, to_jsonb(t) as r from ${q} t
        where t.ctid > ${lit(curseur)}::tid order by t.ctid limit ${taille}`)
    } catch (e) {
      if (taille > 1) { taille = Math.max(1, Math.floor(taille / 4)); continue }
      throw e
    }
    if (!lignes.length) break
    await db.query(
      `insert into ${q} (${cols}) overriding system value select ${cols} from jsonb_populate_recordset(null::${q}, $1::jsonb)`,
      [JSON.stringify(lignes.map((l) => l.r))])
    total += lignes.length
    curseur = lignes[lignes.length - 1]._ctid
    process.stdout.write(`\r    ${q} : ${total} ligne(s)`)
  }
  process.stdout.write(`\r    ${q} : ${total} ligne(s)\n`)
  return total
}

async function compter(src, q) {
  const [r] = await src.sql(`select count(*)::int as n from ${q}`)
  return r.n
}

async function migrer() {
  if (fs.existsSync(MARQUEUR)) {
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

  const src = await questions(rl)

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
  const ok = await demander(rl, 'Tapez OUI puis Entrée pour lancer la copie : ')
  rl.close()
  if (ok.toLowerCase() !== 'oui') {
    dire('Copie annulée. Relancez Installer-OCR quand vous voudrez.')
    process.exit(1)
  }

  const db = new pg.Client({
    host: 'db', port: 5432, database: 'postgres', user: 'supabase_admin',
    password: process.env.POSTGRES_PASSWORD,
  })
  await db.connect()

  // 1. Structure + données en une seule transaction : en cas d'erreur, rien n'est gardé.
  dire()
  dire('1/3  Copie de la structure et des données...')
  if (fs.existsSync(ETAPE1)) {
    dire(c.ok('     Déjà faite lors d\'un essai précédent.'))
  } else try {
    await db.query('begin')
    await db.query("set local check_function_bodies = off; set local session_replication_role = replica; set local search_path = public, extensions")
    for (const e of structure.extensions) {
      await db.query('savepoint ext')
      try {
        await db.query(`create extension if not exists ${qid(e.nom)} with schema ${qid(e.schema)}`)
      } catch {
        await db.query('rollback to savepoint ext')
      }
    }
    for (const instruction of scriptStructure(structure)) {
      try {
        await db.query(instruction)
      } catch (e) {
        throw new Error(`${e.message}\n--- instruction ---\n${instruction}`)
      }
    }

    // Comptes utilisateurs (mots de passe chiffrés inclus), puis buckets, puis données de l'app.
    for (const q of ['auth.users', 'auth.identities', 'storage.buckets']) {
      await copierTable(src, db, q, await colonnesSource(src, q))
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
          'Cache-Control': f.metadata?.cacheControl ? `max-age=${f.metadata.cacheControl}` : 'max-age=3600',
        },
        body: contenu,
      })
      if (!rep.ok) throw new Error(`envoi refusé (${rep.status}) : ${(await rep.text()).slice(0, 200)}`)
    } catch (e) {
      echecs.push(`${f.bucket_id}/${f.name} : ${e.message}`)
    }
    process.stdout.write(`\r     ${i + 1}/${fichiers.length} fichier(s)`)
  }
  if (fichiers.length) process.stdout.write('\n')
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

const action = process.argv[2]
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
  dire('à votre prestataire, ou relancez Installer-OCR pour réessayer.')
  process.exit(1)
}
