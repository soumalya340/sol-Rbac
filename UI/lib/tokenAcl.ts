import { AnchorProvider } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  findMintConfigPda,
  getCreateConfigInstructionDataEncoder,
  getTogglePermissionlessInstructionsInstructionDataEncoder,
  getMintConfigDecoder,
  TOKEN_ACL_PROGRAM_ADDRESS,
} from "@solana/token-acl-sdk";
import type { Address } from "@solana/kit";
import type { Network } from "./rbac";

const TOKEN_ACL_PROGRAM_ID = new PublicKey(TOKEN_ACL_PROGRAM_ADDRESS);

function solscanLink(tx: string, network: Network): string {
  return network === "devnet" ? `https://solscan.io/tx/${tx}?cluster=devnet` : `https://solscan.io/tx/${tx}`;
}

export async function getMintConfigPda(mint: string): Promise<PublicKey> {
  const [pda] = await findMintConfigPda({ mint: mint as Address });
  return new PublicKey(pda);
}

export async function viewTokenAclConfig(connection: Connection, params: { mint: string }) {
  const mintConfig = await getMintConfigPda(params.mint);
  const info = await connection.getAccountInfo(mintConfig);
  if (!info) {
    throw new Error("Token ACL mint config not found for this mint.");
  }
  const data = getMintConfigDecoder().decode(new Uint8Array(info.data));
  return {
    mintConfig: mintConfig.toBase58(),
    mint: data.mint,
    gatingProgram: data.gatingProgram,
    enablePermissionlessFreeze: data.enablePermissionlessFreeze,
    enablePermissionlessThaw: data.enablePermissionlessThaw,
  };
}

export async function createTokenAclConfig(
  connection: Connection,
  wallet: AnchorWallet,
  params: { mint: string; gatingProgram: string; network: Network },
) {
  const mint = new PublicKey(params.mint);
  const mintConfig = await getMintConfigPda(params.mint);
  const data = Buffer.from(
    getCreateConfigInstructionDataEncoder().encode({
      gatingProgram: params.gatingProgram as Address,
    }),
  );

  const ix = new TransactionInstruction({
    programId: TOKEN_ACL_PROGRAM_ID,
    keys: [
      { pubkey: wallet.publicKey, isSigner: false, isWritable: true }, // payer
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false }, // authority
      { pubkey: mint, isSigner: false, isWritable: true }, // mint
      { pubkey: mintConfig, isSigner: false, isWritable: true }, // mint_config PDA
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const tx = await provider.sendAndConfirm(new Transaction().add(ix));
  return { tx, link: solscanLink(tx, params.network), mintConfig: mintConfig.toBase58() };
}

export async function toggleTokenAclPermissionless(
  connection: Connection,
  wallet: AnchorWallet,
  params: { mint: string; freezeEnabled: boolean; thawEnabled: boolean; network: Network },
) {
  const mintConfig = await getMintConfigPda(params.mint);
  const data = Buffer.from(
    getTogglePermissionlessInstructionsInstructionDataEncoder().encode({
      freezeEnabled: params.freezeEnabled,
      thawEnabled: params.thawEnabled,
    }),
  );

  const ix = new TransactionInstruction({
    programId: TOKEN_ACL_PROGRAM_ID,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false }, // authority
      { pubkey: mintConfig, isSigner: false, isWritable: true },
    ],
    data,
  });

  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const tx = await provider.sendAndConfirm(new Transaction().add(ix));
  return { tx, link: solscanLink(tx, params.network), mintConfig: mintConfig.toBase58() };
}

export const TOKEN_ACL_INFO = {
  programId: TOKEN_ACL_PROGRAM_ID.toBase58(),
};
