# wallet-passkeys-app

A demo dApp that authenticates users via the EffectStream
[`wallet-passkeys`](https://github.com/effectstream/wallet-passkeys) worker.
Embeds the wallet's `/embed` route as a cross-origin iframe and uses the
documented `postMessage` RPC to register passkeys, sign in, and request
signatures — without ever holding any private key material itself.

**Live deployment**: <https://wallet-passkeys-app.ac-edward.workers.dev>

This is a fork of [`rvcas/fake-app`](https://github.com/rvcas/fake-app),
adapted to point at the EffectStream-hosted wallet-passkeys worker and to
deploy under the EffectStream Cloudflare account.

## What it does

A minimal third-party application that demonstrates how to integrate with
`wallet-passkeys` from a different origin:

1. Mounts <https://wallet-passkeys.ac-edward.workers.dev/embed> as a same-page
   iframe inside a Card component.
2. Listens for `midnightos-passkeys` `postMessage` events from that iframe.
3. Sends `midnightos-dapp` requests back when the user clicks Register, Sign
   In, or Sign Message.
4. Displays the returned `did:key` identity, the access key's public key, and
   the signed message (raw `r||s` + DER ASN.1).

The dApp itself stores no key material. Every credential, every signature, and
every byte of private key lives at the wallet-passkeys origin. The dApp only
sees public artifacts: the user's DID, the access key's public key, signatures.

## Cross-origin postMessage protocol

The iframe and parent exchange typed messages over `postMessage`:

| Direction | `type` | Payload |
|---|---|---|
| dApp → wallet | `register` | `{ username }` |
| dApp → wallet | `sign-in` | `{ credentialId? }` |
| dApp → wallet | `sign` | `{ message, requestId }` |
| wallet → dApp | `ready` | `{}` |
| wallet → dApp | `authenticated` | `{ credential, did, didDocument, accessKeyPublicKey, keyAuthorization }` |
| wallet → dApp | `signed` | `{ requestId, message, signature, signatureDer, publicKey }` |
| wallet → dApp | `sign-error` / `error` | `{ requestId?, message }` |

Each side discriminates messages by a `source` string (`midnightos-dapp` or
`midnightos-passkeys`) plus an origin check so neither will react to traffic
from an unrelated frame.

## Local development

```sh
pnpm install
pnpm dev
# Vite+ dev server at http://localhost:5173 (or whatever vp picks)
```

To run against a local wallet-passkeys instance instead of the deployed worker,
edit the `PASSKEYS_ORIGIN` constant in
[`src/components/fake-dapp.tsx`](./src/components/fake-dapp.tsx) — by default
it points at <https://wallet-passkeys.ac-edward.workers.dev>.

## Build + deploy

```sh
pnpm run build       # tsc + vp build → dist/
pnpm run deploy      # builds + wrangler deploy
```

The deploy targets the EffectStream Cloudflare account
(`28ea08e36bc67a4f136df373255ce175`) via [wrangler.jsonc](./wrangler.jsonc).
The worker binding name is `wallet-passkeys-app`, so the workers.dev URL is
<https://wallet-passkeys-app.ac-edward.workers.dev>.

## How to test

1. Open <https://wallet-passkeys-app.ac-edward.workers.dev/> in Chrome (or any
   browser with platform passkey + WebAuthn support).
2. Click **Connect with Passkey**. The wallet-passkeys iframe appears.
3. Inside the iframe, click **Register**. Your OS shows the passkey-create
   prompt (Touch ID, Windows Hello, Android biometric, etc).
4. Approve. The iframe completes the flow and posts your `did:key:z…` identity
   back to this dApp; the iframe collapses and the Identity card appears.
5. Type a message into **Sign Message** and click the button. The dApp posts a
   `sign` request to the iframe; the access key (held inside wallet-passkeys)
   signs the message without re-prompting biometrics. The signed message + raw
   and DER signatures appear in the UI.

End-to-end, the user touched the OS biometric prompt once during Register and
once if they ever call `sign-in` again on a fresh session. Subsequent message
signatures are silent.

## How this fits in EffectStream

Together with [`wallet-passkeys`](https://github.com/effectstream/wallet-passkeys)
this pair is a reference implementation of the embed-and-postMessage pattern
EffectStream uses elsewhere — including the
[`effectstream-social-2of3-wallet`](https://github.com/effectstream/effectstream-social-2of3-wallet)
multi-chain wallet, which uses the same cross-origin iframe + postMessage
protocol shape for its EVM / Cardano / Midnight signing surface.

The passkey design here is complementary, not competing:

* **wallet-passkeys** — passkey is the *root* signing key, access key is a
  delegated session signer. Single-curve (P-256 ECDSA), single identity (`did:key`).
* **effectstream-social-2of3-wallet** — passkey/Drive is the *unlock* for one
  Shamir share; the actual signing keys are derived per-chain from a master
  entropy. Multi-chain (EVM secp256k1, Cardano ed25519/Icarus, Midnight Zswap
  + Dust + Night), one entropy per user.

You can run them side-by-side or pick whichever model fits your app.

## License

Same as the upstream project. See [LICENSE](./LICENSE) once added.
