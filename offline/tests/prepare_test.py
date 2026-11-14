import base64
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from offline import prepare


class PrepareTest(unittest.TestCase):
    def test_split_and_reassemble_with_deduplication(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "objects").mkdir()
            data = b"abcdabcdxyz"
            source = root / "sample"
            source.write_bytes(data)
            manifest = prepare.segment(source, root, segment_bytes=4)
            self.assertEqual([4, 4, 3], [part["size"] for part in manifest["parts"]])
            self.assertEqual(2, len(list((root / "objects").iterdir())))
            recovered = b"".join((root / part["key"]).read_bytes() for part in manifest["parts"])
            self.assertEqual(data, recovered)
            self.assertEqual(hashlib.sha256(data).hexdigest(), manifest["sha256"])

    def test_signed_manifest_and_bootstrap_trust_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            key = root / "key.pem"
            public = root / "public.pem"
            signature = root / "signature"
            payload = root / "payload"
            subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt",
                            "rsa_keygen_bits:2048", "-out", key], check=True, capture_output=True)
            subprocess.run(["openssl", "pkey", "-in", key, "-pubout", "-out", public], check=True)
            signed = prepare.signed_manifest({"format": 1, "sequence": 9}, key)
            signature.write_bytes(base64.b64decode(signed["signature"]))
            payload.write_bytes(base64.b64decode(signed["payload"]))
            verify = ["openssl", "dgst", "-sha256", "-verify", public, "-signature", signature, payload]
            subprocess.run(verify, check=True, capture_output=True)
            payload.write_bytes(json.dumps({"format": 1, "sequence": 10}).encode())
            self.assertNotEqual(0, subprocess.run(verify, capture_output=True).returncode)
            url = "https://installer.example/" + "a" * 64 + "/manifest.json"
            bootstrap = prepare.make_bootstrap(key, url)
            self.assertIn(url, bootstrap)
            self.assertNotIn("__RSA_MODULUS__", bootstrap)
            self.assertNotIn("PRIVATE KEY", bootstrap)


if __name__ == "__main__":
    unittest.main()
