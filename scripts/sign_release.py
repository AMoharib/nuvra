"""Sign a draft GitHub release with the offline Ed25519 key, then publish it.

    python scripts/sign_release.py --new-key      create the key once; paste the printed hex into updates.PUBLIC_KEY
    python scripts/sign_release.py v0.2.0         sign the draft's installer, upload the .sig, publish

The private key never leaves this computer. Back it up (for example in a password manager): without it, users must
reinstall manually once to trust a new key.
"""
import argparse
import hashlib
from pathlib import Path
import re
import subprocess
import sys
import tempfile

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (Encoding, NoEncryption, PrivateFormat, PublicFormat,
                                                          load_pem_private_key)

from arabic_relay import updates

KEY = Path.home() / '.arabic-relay' / 'release-signing.key'


def new_key(path):
    if path.exists():
        raise FileExistsError(f'{path} already exists; it is never overwritten.')
    path.parent.mkdir(parents=True, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    with path.open('xb') as out:
        out.write(key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()))
    return key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()


def sign(file, key_path):
    key = load_pem_private_key(Path(key_path).read_bytes(), None)
    return key.sign(Path(file).read_bytes())


def gh(*args):
    subprocess.run(['gh', *args], check=True)


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('tag', nargs='?')
    parser.add_argument('--new-key', action='store_true')
    parser.add_argument('--key', default=str(KEY))
    args = parser.parse_args(argv)
    if args.new_key:
        print(new_key(Path(args.key)))
        print(f'Key saved to {args.key}. Back it up now.', file=sys.stderr)
        return 0
    if not args.tag:
        parser.error('give a release tag, for example v0.2.0')
    if not re.fullmatch(r'v\d+\.\d+\.\d+', args.tag):
        parser.error('the release tag must be v<major>.<minor>.<patch>')
    version = args.tag[1:]
    names = [f'Nuvra-Setup-{version}.exe', f'ArabicRelay-Setup-{version}.exe']
    with tempfile.TemporaryDirectory() as folder:
        gh('release', 'download', args.tag, '-p', names[0], '-p', names[1], '-D', folder)
        found = [Path(folder) / name for name in names if (Path(folder) / name).is_file()]
        if not found:
            print(f'No installer for {args.tag}. Nothing was published.', file=sys.stderr)
            return 1
        digests = set()
        for setup in found:
            with setup.open('rb') as source:
                digests.add(hashlib.file_digest(source, 'sha256').digest())
        if len(digests) != 1:
            print('The installer and legacy alias differ. Nothing was published.', file=sys.stderr)
            return 1
        signatures = []
        for setup in found:
            signature = sign(setup, args.key)
            if not updates.verify(setup, signature):
                print('This key does not match updates.PUBLIC_KEY built into the app. Nothing was published.', file=sys.stderr)
                return 1
            signature_file = setup.with_name(setup.name + '.sig')
            signature_file.write_bytes(signature)
            signatures.append(str(signature_file))
        gh('release', 'upload', args.tag, *signatures, '--clobber')
        gh('release', 'edit', args.tag, '--draft=false')
    print(f'{args.tag} is signed and published.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
