"""Encrypt stored credentials with a key held in the user's macOS login Keychain."""
import threading

import Security
from cryptography.fernet import Fernet, InvalidToken

LOCK = threading.Lock()
ITEM = {
    Security.kSecClass: Security.kSecClassGenericPassword,
    Security.kSecAttrService: 'io.github.mahmoud6901.nuvra',
    Security.kSecAttrAccount: 'credential-encryption',
}


def key(create):
    query = {**ITEM, Security.kSecReturnData: True, Security.kSecMatchLimit: Security.kSecMatchLimitOne}
    status, data = Security.SecItemCopyMatching(query, None)
    if status == Security.errSecItemNotFound and create:
        data = Fernet.generate_key()
        status, _ = Security.SecItemAdd({**ITEM, Security.kSecValueData: data}, None)
        if status == Security.errSecDuplicateItem:  # Another process created the shared key first.
            return key(False)
    if status != Security.errSecSuccess:
        raise ValueError('Nuvra could not access its login Keychain key. Unlock the login Keychain and try again.')
    return bytes(data)


def protect(data, decrypt=False):
    with LOCK:
        cipher = Fernet(key(create=not decrypt))
        try:
            return cipher.decrypt(data) if decrypt else cipher.encrypt(data)
        except InvalidToken:
            raise ValueError('This saved credential cannot be decrypted. Enter it again in Settings.') from None
