import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Points at the EffectStream-hosted wallet-passkeys worker. Override locally
// by editing this constant if you're running wallet-passkeys on localhost.
const PASSKEYS_ORIGIN = "https://wallet-passkeys.ac-edward.workers.dev";
const EMBED_URL = `${PASSKEYS_ORIGIN}/embed`;

type KeyAuthorization = {
  rootPublicKey: string;
  accessKeyPublicKey: string;
  credentialId: string;
  authorizedAt: number;
};

type AuthResult = {
  credential: { credentialId: string; publicKey: string };
  did: string;
  didDocument: Record<string, unknown>;
  accessKeyPublicKey: string;
  keyAuthorization?: KeyAuthorization;
};

type SignResult = {
  message: string;
  signature: string;
  signatureDer: string;
  publicKey: string;
};

export function FakeDapp() {
  // `iframeMounted` keeps the iframe in the DOM (its JS context holds the
  // access key, so it must survive after auth to handle sign requests).
  // `popupVisible` controls whether the floating wallet dock is shown.
  const [iframeMounted, setIframeMounted] = useState(false);
  const [popupVisible, setPopupVisible] = useState(false);
  const [authResult, setAuthResult] = useState<AuthResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageToSign, setMessageToSign] = useState("Hello from the Demo App!");
  const [signResult, setSignResult] = useState<SignResult | null>(null);
  const [signing, setSigning] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const signResolveRef = useRef<((result: SignResult) => void) | null>(null);
  const signRejectRef = useRef<((error: Error) => void) | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== PASSKEYS_ORIGIN) return;
      const data = event.data;
      if (data?.source !== "midnightos-passkeys") return;

      if (data.type === "authenticated") {
        setAuthResult(data.payload);
        setError(null);
        // Auth done — collapse the floating popup, but keep the iframe mounted
        // (hidden) so its access key can still sign later requests.
        setPopupVisible(false);
      } else if (data.type === "close") {
        // User pressed Cancel / OK inside the wallet popup. If they never
        // authenticated, tear the iframe down entirely; otherwise just hide.
        setPopupVisible(false);
        setAuthResult((prev) => {
          if (!prev) setIframeMounted(false);
          return prev;
        });
      } else if (data.type === "error") {
        setError(data.payload?.message ?? "Authentication failed");
      } else if (data.type === "signed") {
        signResolveRef.current?.(data.payload);
        signResolveRef.current = null;
        signRejectRef.current = null;
      } else if (data.type === "sign-error") {
        signRejectRef.current?.(new Error(data.payload?.error ?? "Signing failed"));
        signResolveRef.current = null;
        signRejectRef.current = null;
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleConnect = useCallback(() => {
    setIframeMounted(true);
    setPopupVisible(true);
    setError(null);
  }, []);

  function handleDisconnect() {
    setAuthResult(null);
    setIframeMounted(false);
    setPopupVisible(false);
    setSignResult(null);
    setError(null);
  }

  const handleSign = useCallback(async () => {
    if (!iframeRef.current?.contentWindow) return;
    setSigning(true);
    setSignResult(null);
    setError(null);

    try {
      const result = await new Promise<SignResult>((resolve, reject) => {
        signResolveRef.current = resolve;
        signRejectRef.current = reject;

        iframeRef.current!.contentWindow!.postMessage(
          {
            source: "midnightos-dapp",
            type: "sign",
            payload: {
              message: messageToSign,
              requestId: crypto.randomUUID(),
            },
          },
          PASSKEYS_ORIGIN,
        );

        setTimeout(() => {
          if (signResolveRef.current) {
            reject(new Error("Sign request timed out"));
            signResolveRef.current = null;
            signRejectRef.current = null;
          }
        }, 30_000);
      });

      setSignResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing failed");
    } finally {
      setSigning(false);
    }
  }, [messageToSign]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 pt-12">
      {/* Editorial wordmark header */}
      <div className="flex items-end justify-between gap-6">
        <div className="space-y-3">
          <span className="es-chip">Demo dApp · Issue 01</span>
          <h1 className="es-wordmark">
            EFFECT<span className="accent">STREAM</span>
            <br />DEMO<span className="accent">.</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-md">
            {authResult
              ? "Connected · access key issued by wallet-passkeys"
              : "A consumer application that authenticates users through a cross-origin wallet iframe. This page holds no key material."}
          </p>
        </div>
        {authResult && (
          <Button variant="outline" onClick={handleDisconnect}>
            Disconnect
          </Button>
        )}
      </div>
      <div className="es-rule" />

      {/* Connect button — shown before iframe is mounted */}
      {!iframeMounted && !authResult && (
        <Card>
          <CardHeader>
            <CardTitle>Connect Wallet</CardTitle>
            <CardDescription>
              Sign in with your EffectStream passkey — no extensions, no seed phrases
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button onClick={handleConnect}>Connect with Passkey</Button>
          </CardContent>
        </Card>
      )}

      {error && !authResult && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Floating wallet popup — fixed top-right like a browser-extension
          wallet. The iframe stays mounted (so its access key survives for
          later sign requests) but the dock hides once the popup is dismissed.
          The wallet's own header / body / OK-Cancel footer live inside. */}
      {iframeMounted && (
        <div
          className="wallet-dock"
          style={{ display: popupVisible ? "block" : "none" }}
        >
          <iframe
            ref={iframeRef}
            src={EMBED_URL}
            allow="publickey-credentials-create; publickey-credentials-get"
            title="EffectStream Passkeys wallet"
          />
        </div>
      )}

      {/* Identity card — shown after auth */}
      {authResult && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Your Identity</CardTitle>
              <CardDescription>Cross-domain passkey authentication via iframe</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-muted-foreground text-xs">DID</span>
                <p className="font-mono text-xs break-all">{authResult.did}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">
                  Access Key Public Key
                </span>
                <p className="font-mono text-xs break-all">{authResult.accessKeyPublicKey}</p>
              </div>
              {authResult.keyAuthorization && (
              <div>
                <span className="text-muted-foreground text-xs">Key Authorization</span>
                <p className="text-xs text-muted-foreground mt-1">
                  Root key <span className="font-mono">{authResult.keyAuthorization.rootPublicKey.slice(0, 20)}...</span> authorized this access key at {new Date(authResult.keyAuthorization.authorizedAt).toLocaleString()}
                </p>
              </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sign Message</CardTitle>
              <CardDescription>
                Sign a message with your access key via the embedded iframe
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="message" className="text-xs text-muted-foreground">
                  Message
                </label>
                <input
                  id="message"
                  type="text"
                  value={messageToSign}
                  onChange={(e) => setMessageToSign(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button onClick={handleSign} disabled={signing || !messageToSign}>
                {signing ? "Signing..." : "Sign Message"}
              </Button>

              {signResult && (
                <div className="space-y-2 pt-2">
                  <div>
                    <span className="text-muted-foreground text-xs">Message</span>
                    <p className="font-mono text-xs break-all">{signResult.message}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Signature (raw r||s)</span>
                    <p className="font-mono text-xs break-all">{signResult.signature}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Signature (DER)</span>
                    <p className="font-mono text-xs break-all">{signResult.signatureDer}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Signed by</span>
                    <p className="font-mono text-xs break-all">{signResult.publicKey}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
