"""Build immutable, segmented V2 OCR releases on a Linux/amd64 release machine."""
import argparse
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SEGMENT_BYTES = 64 * 1024 * 1024
TOKEN = "V2OCR_PUBLIC_ANON_KEY_70E3788B645D"
BUCKET = "v2-ocr-offline-installer"
IMAGES = re.compile(r"^(    image: )(\S+)$", re.MULTILINE)
HEX = re.compile(r"[a-f0-9]{64}")
VERSION = re.compile(r"[A-Za-z0-9][A-Za-z0-9.-]{0,63}")
BASE = "node:20-alpine"


def run(*args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, **kwargs)


def capture(*args):
    return run(*args, stdout=subprocess.PIPE, text=True).stdout.strip()


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def compose_sources():
    compose = (ROOT / "local/docker-compose.yml").read_text(encoding="utf-8")
    return compose, sorted(set(image for _, image in IMAGES.findall(compose)) | {BASE})


def lock_images(destination):
    _, tags = compose_sources()
    pins = {}
    for tag in tags:
        run("docker", "pull", "--platform", "linux/amd64", tag)
        pins[tag] = json.loads(capture("docker", "image", "inspect", tag))[0]["RepoDigests"][0]
    with destination.open("x", encoding="utf-8") as target:
        json.dump(pins, target, indent=2)


def stage_images(locked, revision, work):
    compose, sources = compose_sources()
    pins = json.loads(locked.read_text(encoding="utf-8"))
    if set(pins) != set(sources):
        raise ValueError("Verrou d'images different du fichier Compose")
    images = {}
    ids = {}
    for tag in sources:
        pin = pins[tag]
        if not re.fullmatch(r"[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}", pin):
            raise ValueError(f"Empreinte immuable absente pour {tag}")
        run("docker", "pull", "--platform", "linux/amd64", pin)
        image = json.loads(capture("docker", "image", "inspect", pin))[0]
        if (image["Os"], image["Architecture"]) != ("linux", "amd64"):
            raise ValueError(f"Architecture inattendue pour {tag}")
        alias = "v2ocr-offline/service:" + image["Id"].removeprefix("sha256:")
        run("docker", "tag", pin, alias)
        images[tag], ids[alias] = alias, image["Id"]

    # Exclude all untracked files from the Docker context, including local credentials.
    context = work / "build"
    context.mkdir()
    source_tar = work / "source.tar"
    run("git", "archive", "--format=tar", "-o", str(source_tar), revision)
    with tarfile.open(source_tar) as archive:
        archive.extractall(context, filter="data")
    build_tag = "v2ocr-offline/build:" + revision
    run("docker", "build", "--platform", "linux/amd64", "--target", "prod",
        "--build-arg", f"NODE_IMAGE={pins[BASE]}", "--build-arg", f"BUILD_ID={revision}",
        "--build-arg", "OCR_BUILD_SUPABASE_URL=http://localhost:8000",
        "--build-arg", f"OCR_BUILD_SUPABASE_ANON_KEY={TOKEN}", "-t", build_tag, str(context))
    app_id = capture("docker", "image", "inspect", "--format", "{{.Id}}", build_tag)
    app = "v2ocr-offline/app:" + app_id.removeprefix("sha256:")
    run("docker", "tag", app_id, app)
    ids[app] = app_id
    run("docker", "run", "--rm", "--network", "none", "--pull", "never", app,
        "node", "-e", "const fs=require('fs');const p='/opt/.next/static';"
        "if(!fs.readdirSync(p,{recursive:true}).some(n=>n.endsWith('.js')"
        f"&&fs.readFileSync(p+'/'+n,'utf8').includes('{TOKEN}')))process.exit(1);")
    compose = IMAGES.sub(lambda m: m[1] + images[m[2]], compose)
    compose = replace_once(compose, "    build:\n      context: ..\n      target: prod", f"    image: {app}")
    compose = replace_once(compose, "    env_file: ../.env.local", '    env_file: "${OCR_STATE}/.env.local"')
    compose = replace_once(compose, "      - ./relais-supabase.cjs:/opt/relais-supabase.cjs:ro",
        "      - ./relais-supabase.cjs:/projet-relay.cjs:ro\n"
        "      - ./runtime-config.cjs:/runtime-config.cjs:ro")
    compose = replace_once(compose, 'command: ["node", "/opt/relais-supabase.cjs"]',
        'command: ["node", "/runtime-config.cjs"]')
    compose = replace_once(compose, "      - ..:/projet",
        '      - "${OCR_STATE}:/projet"\n      - ./assistant:/projet/local/assistant:ro')
    compose = replace_once(compose, 'GOTRUE_DISABLE_SIGNUP: "false"', 'GOTRUE_DISABLE_SIGNUP: "true"')
    return compose, images[BASE], ids, pins


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError("Configuration Compose incompatible: " + old)
    return text.replace(old, new)


def make_archives(args, revision, work):
    compose, helper, ids, pins = stage_images(args.lock, revision, work)
    stage = work / "stage"
    stage.mkdir()
    shutil.copytree(ROOT / "local/supabase", stage / "supabase")
    # Include exactly the tracked dependencies and assistant files.
    shutil.copytree(work / "build/local/assistant", stage / "assistant",
                    ignore=shutil.ignore_patterns("*.test.mjs"))
    shutil.copyfile(ROOT / "local/relais-supabase.cjs", stage / "relais-supabase.cjs")
    shutil.copyfile(ROOT / "offline/runtime-config.cjs", stage / "runtime-config.cjs")
    shutil.copyfile(ROOT / "offline/crypt.mjs", stage / "crypt.mjs")
    (stage / "compose.yml").write_text(compose, encoding="utf-8")
    write_json(stage / "images.json", {"helper": helper, "ids": ids, "sources": pins})
    archives = {}
    archives["runtime"] = work / "runtime.tar.gz"
    with tarfile.open(archives["runtime"], "w:gz", format=tarfile.PAX_FORMAT) as tar:
        for item in sorted(stage.iterdir()):
            tar.add(item, arcname=item.name)
    images_tar = work / "images.tar"
    run("docker", "image", "save", "-o", str(images_tar), *sorted(ids))
    archives["images"] = work / "images.tar.gz"
    with images_tar.open("rb") as src, archives["images"].open("wb") as target:
        with gzip.GzipFile(fileobj=target, mode="wb", compresslevel=1, mtime=0, filename="") as zipped:
            shutil.copyfileobj(src, zipped)
    images_tar.unlink()
    if args.payload:
        metadata = json.loads((args.payload / "manifest.json").read_text(encoding="utf-8"))
        if (metadata.get("format") != "ocr-offline-1" or
                metadata.get("filtre", {}).get("perimetre") != "comptes choisis" or
                metadata["filtre"].get("comptes", 0) < 1):
            raise ValueError("Export filtre par compte requis")
        if not re.fullmatch(r"1[4-7][0-9]{4}", str(metadata.get("postgresVersion", ""))):
            raise ValueError("PostgreSQL source 14 a 17 non confirme: refaire l'export avec cette branche")
        run("node", "local/assistant/archive.mjs", "verify", str(args.payload))
        plain = work / "migration.tar"
        with tarfile.open(plain, "w", format=tarfile.PAX_FORMAT) as archive:
            for filename in ["manifest.json", *sorted(metadata["files"])]:
                target = args.payload / filename
                if not target.is_file() or target.is_symlink():
                    raise ValueError("Fichier export invalide")
                archive.add(target, arcname=filename, recursive=False)
        archives["migration"] = work / "migration.enc"
        try:
            with args.migration_key.open("rb") as secret:
                run("node", "offline/crypt.mjs", "encrypt", str(plain), str(archives["migration"]), stdin=secret)
        finally:
            plain.unlink(missing_ok=True)
    if args.wsl:
        archives["wsl"] = args.wsl
    if args.docker_desktop:
        archives["docker"] = args.docker_desktop
    return archives


def segment(source, destination, segment_bytes=SEGMENT_BYTES):
    full = hashlib.sha256()
    parts = []
    size = 0
    with source.open("rb") as stream:
        while data := stream.read(segment_bytes):
            full.update(data)
            size += len(data)
            digest = hashlib.sha256(data).hexdigest()
            name = f"objects/{digest}"
            target = destination / name
            if not target.exists():
                target.write_bytes(data)
            parts.append({"key": name, "size": len(data), "sha256": digest})
    if not parts:
        raise ValueError(f"Fichier vide: {source.name}")
    return {"size": size, "sha256": full.hexdigest(), "parts": parts}


def signed_manifest(manifest, key):
    payload = json.dumps(manifest, separators=(",", ":"), sort_keys=True).encode()
    signature = run("openssl", "dgst", "-sha256", "-sign", str(key), input=payload,
                    stdout=subprocess.PIPE).stdout
    return {name: base64.b64encode(value).decode() for name, value in
            [("payload", payload), ("signature", signature)]}


def make_bootstrap(key, channel_url):
    modulus = capture("openssl", "rsa", "-in", str(key), "-noout", "-modulus").partition("=")[2]
    public = capture("openssl", "rsa", "-in", str(key), "-text", "-noout").splitlines()
    if not any(re.match(r"publicExponent: 65537\b", line) for line in public) or len(modulus) < 512:
        raise ValueError("Cle RSA d'au moins 2048 bits, exposant 65537 requis")
    modulus64 = base64.b64encode(bytes.fromhex(modulus)).decode()
    parsed = urlsplit(channel_url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.query or parsed.fragment
            or parsed.username or not re.fullmatch(r"/[a-f0-9]{64}/manifest\.json", parsed.path)):
        raise ValueError("URL HTTPS du canal prive requise")
    return ((ROOT / "offline/install.ps1").read_text(encoding="ascii")
            .replace("__RELEASE_URL__", channel_url)
            .replace("__RSA_MODULUS__", modulus64)
            .replace("__UNINSTALL_BASE64__", base64.b64encode((ROOT / "offline/uninstall.ps1").read_text().replace("# __WINDOWS_COMMON__", (ROOT / "offline/windows-common.ps1").read_text()).encode()).decode())
            .replace("# __WINDOWS_COMMON__", (ROOT / "offline/windows-common.ps1").read_text(encoding="ascii")))


def build(args):
    if not VERSION.fullmatch(args.version) or args.sequence < 1:
        raise ValueError("Version et sequence positives requises")
    if bool(args.payload) != bool(args.migration_key):
        raise ValueError("Le dossier d'export et le fichier de cle sont indissociables")
    if capture("git", "status", "--porcelain", "--untracked-files=no"):
        raise ValueError("Les modifications doivent etre commitees avant la construction")
    revision = capture("git", "rev-parse", "HEAD")
    if not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise ValueError("Commit Git invalide")
    bootstrap = make_bootstrap(args.signing_key, args.channel_url)
    destination = args.output
    destination.mkdir()
    (destination / "objects").mkdir()
    with tempfile.TemporaryDirectory(prefix=".prepare-", dir=destination) as directory:
        archives = make_archives(args, revision, Path(directory))
        manifest = {
            "format": 1, "version": args.version, "sequence": args.sequence, "commit": revision,
            "archives": {name: segment(file, destination) for name, file in archives.items()},
        }
        write_json(destination / "manifest.json", signed_manifest(manifest, args.signing_key))
    (destination / "install.ps1").write_text(bootstrap, encoding="ascii")


def publish(args):
    # A bucket-scoped R2 S3 token must already be configured for the release operator.
    endpoint = os.environ["OCR_R2_S3_ENDPOINT"]
    if not re.fullmatch(r"https://[a-f0-9]{32}\.r2\.cloudflarestorage\.com", endpoint):
        raise ValueError("Endpoint S3 R2 invalide")
    if not re.fullmatch(r"[a-f0-9]{64}", args.channel):
        raise ValueError("Canal prive invalide (64 caracteres hexadecimaux)")
    if f"/{args.channel}/manifest.json" not in (args.output / "install.ps1").read_text(encoding="ascii"):
        raise ValueError("Canal et URL de l'installateur incoherents")
    envelope = args.output / "manifest.json"
    manifest_key = f"{args.channel}/manifest.json"
    manifest = json.loads(base64.b64decode(json.loads(envelope.read_text())["payload"]))
    s3 = ["aws", "--endpoint-url", endpoint, "s3api"]
    with tempfile.TemporaryDirectory() as directory:
        previous = Path(directory) / "manifest.json"
        get = subprocess.run([*s3, "get-object", "--bucket", BUCKET, "--key", manifest_key, str(previous)],
                             capture_output=True, text=True)
        if get.returncode == 0:
            if previous.read_bytes() == envelope.read_bytes():
                return
            last = json.loads(base64.b64decode(json.loads(previous.read_text())["payload"]))
            if manifest["sequence"] <= last["sequence"]:
                raise ValueError("Sequence de publication deja utilisee")
            previous_etag = json.loads(get.stdout)["ETag"]
        elif "NoSuchKey" in get.stderr:
            previous_etag = None
        else:
            raise RuntimeError("Lecture du manifeste R2 impossible: " + get.stderr)

    def upload(key, path, content_type, immutable=False, etag=None):
        command = [*s3, "put-object",
                   "--bucket", BUCKET, "--key", key, "--body", str(path),
                   "--content-type", content_type, "--cache-control", "no-store"]
        if immutable or key == manifest_key and etag is None:
            command += ["--if-none-match", "*"]
        elif etag is not None:
            command += ["--if-match", etag]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode and not (immutable and "PreconditionFailed" in result.stderr):
            raise RuntimeError(f"Envoi R2 impossible: {key}\n{result.stderr}")
    for path in sorted((args.output / "objects").iterdir()):
        if not HEX.fullmatch(path.name) or hashlib.sha256(path.read_bytes()).hexdigest() != path.name:
            raise ValueError(f"Segment local incorrect: {path.name}")
        upload(f"{args.channel}/objects/{path.name}", path, "application/octet-stream", immutable=True)
    # Update code at the same URL; the signing key must remain the same for this channel.
    upload(f"{args.channel}/install.ps1", args.output / "install.ps1", "text/plain")
    upload(manifest_key, envelope, "application/json", etag=previous_etag)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    lock = commands.add_parser("lock-images")
    lock.add_argument("destination", type=lambda p: Path(p).resolve())
    package = commands.add_parser("build")
    for name in ("lock", "output", "signing-key", "payload", "migration-key", "wsl", "docker-desktop"):
        package.add_argument("--" + name, type=lambda p: Path(p).resolve(),
                             required=name in {"lock", "output", "signing-key"})
    package.add_argument("--channel-url", required=True)
    package.add_argument("--version", required=True)
    package.add_argument("--sequence", required=True, type=int)
    send = commands.add_parser("publish")
    send.add_argument("output", type=lambda p: Path(p).resolve())
    send.add_argument("--channel", required=True)
    args = parser.parse_args()
    if args.command == "lock-images":
        lock_images(args.destination)
    elif args.command == "build":
        build(args)
    else:
        publish(args)


if __name__ == "__main__":
    main()
