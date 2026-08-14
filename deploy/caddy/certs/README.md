# Local reverse-proxy TLS material

`make up` expects `dev.crt` and `dev.key` in this directory.

- Both missing: `make local-certs` (a prerequisite of `make up`) generates a self-signed pair.
- Both present: existing files are used as-is (copy in mkcert or another local CA if you want).
- Exactly one present: Make fails; copy the matching file or remove the orphan.

These two files are gitignored. This README is not.
