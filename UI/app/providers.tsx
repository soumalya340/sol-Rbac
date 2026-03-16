'use client';

import { Buffer as NodeBuffer } from "buffer";
if (typeof globalThis !== "undefined" && !("Buffer" in globalThis)) {
  (globalThis as { Buffer?: typeof NodeBuffer }).Buffer = NodeBuffer;
}

import { ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import "@solana/wallet-adapter-react-ui/styles.css";

const DEFAULT_DEVNET = "https://api.devnet.solana.com";
const DEFAULT_MAINNET = "https://api.mainnet-beta.solana.com";

export function getRpcEndpoint(network: "devnet" | "mainnet"): string {
  const devnet = process.env.NEXT_PUBLIC_RPC_DEVNET ?? DEFAULT_DEVNET;
  const mainnet = process.env.NEXT_PUBLIC_RPC_MAINNET ?? DEFAULT_MAINNET;
  return network === "mainnet" ? mainnet : devnet;
}

export function Providers({ children, endpoint = DEFAULT_DEVNET }: { children: ReactNode; endpoint?: string }) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new BackpackWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
