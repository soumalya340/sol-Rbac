import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Keypair, Connection, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import RBAC_IDL from "../idl/sol_rbac.json";

export type Network = "devnet" | "mainnet";

const DEFAULT_PROGRAM_ID = new PublicKey((RBAC_IDL as { address: string }).address);

const ORG_SEED = Buffer.from("organization");
const ROLE_SEED = Buffer.from("role");
const ROLE_ASSIGNMENT_SEED = Buffer.from("role_assignment");
const GLOBAL_STATE_SEED = Buffer.from("global_state");
const MANAGED_MINT_SEED = Buffer.from("managed_mint");
const THAW_EXTRA_METAS_SEED = Buffer.from("thaw_extra_account_metas");
const FREEZE_EXTRA_METAS_SEED = Buffer.from("freeze_extra_account_metas");

type IdlJson = typeof RBAC_IDL;

function getProgramId(network: Network): PublicKey {
  const env = network === "mainnet" ? process.env.NEXT_PUBLIC_RBAC_PROGRAM_ID_MAINNET : process.env.NEXT_PUBLIC_RBAC_PROGRAM_ID_DEVNET;
  return env ? new PublicKey(env) : DEFAULT_PROGRAM_ID;
}

function getDummyWallet(): AnchorWallet {
  return {
    publicKey: new PublicKey("11111111111111111111111111111111"),
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };
}

function getIdlForNetwork(network: Network): IdlJson {
  return {
    ...(RBAC_IDL as IdlJson),
    address: getProgramId(network).toBase58(),
  };
}

function getReadOnlyProgram(connection: Connection, network: Network): Program {
  const provider = new AnchorProvider(connection, getDummyWallet(), { commitment: "confirmed" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Program(getIdlForNetwork(network) as any, provider);
}

function getProgram(connection: Connection, wallet: AnchorWallet, network: Network): Program {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Program(getIdlForNetwork(network) as any, provider);
}

function solscanLink(tx: string, network: Network): string {
  return network === "devnet" ? `https://solscan.io/tx/${tx}?cluster=devnet` : `https://solscan.io/tx/${tx}`;
}

export const PERMISSIONS = {
  CAN_TRANSFER: 1,
  CAN_RECEIVE: 2,
  CAN_FREEZE: 4,
  CAN_ADMIN: 8,
  CAN_MINT: 16,
} as const;

export function encodePermissions(selected: number[]): number {
  return selected.reduce((acc, p) => acc | p, 0);
}

export function decodePermissions(mask: number): number[] {
  return Object.values(PERMISSIONS).filter((bit) => (mask & bit) === bit);
}

export function getGlobalStatePda(network: Network): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([GLOBAL_STATE_SEED], getProgramId(network));
  return pda;
}

export function getOrganizationPda(authority: PublicKey, name: string, network: Network): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([ORG_SEED, authority.toBuffer(), Buffer.from(name)], getProgramId(network));
  return pda;
}

export function getRolePda(organization: PublicKey, roleName: string, network: Network): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([ROLE_SEED, organization.toBuffer(), Buffer.from(roleName)], getProgramId(network));
  return pda;
}

export function getRoleAssignmentPda(
  organization: PublicKey,
  role: PublicKey,
  wallet: PublicKey,
  network: Network,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [ROLE_ASSIGNMENT_SEED, organization.toBuffer(), role.toBuffer(), wallet.toBuffer()],
    getProgramId(network),
  );
  return pda;
}

export function getManagedMintPda(organization: PublicKey, mint: PublicKey, network: Network): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([MANAGED_MINT_SEED, organization.toBuffer(), mint.toBuffer()], getProgramId(network));
  return pda;
}

export function getThawExtraMetasPda(mint: PublicKey, network: Network): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([THAW_EXTRA_METAS_SEED, mint.toBuffer()], getProgramId(network));
  return pda;
}

export function getFreezeExtraMetasPda(mint: PublicKey, network: Network): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([FREEZE_EXTRA_METAS_SEED, mint.toBuffer()], getProgramId(network));
  return pda;
}

export async function viewGlobalState(connection: Connection, network: Network) {
  const program = getReadOnlyProgram(connection, network);
  const globalState = getGlobalStatePda(network);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = await (program.account as any).globalState.fetch(globalState);
  return {
    pda: globalState.toBase58(),
    authority: account.authority.toBase58(),
    totalOrgs: account.totalOrgs.toString(),
    totalMints: account.totalMints.toString(),
    feeReceiver: account.feeReceiver.toBase58(),
  };
}

export async function viewOrganization(connection: Connection, params: { authority: string; name: string; network: Network }) {
  const program = getReadOnlyProgram(connection, params.network);
  const organization = getOrganizationPda(new PublicKey(params.authority), params.name, params.network);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = await (program.account as any).organization.fetch(organization);
  return {
    pda: organization.toBase58(),
    authority: account.authority.toBase58(),
    name: account.name,
    roleCount: account.roleCount,
    mintCount: account.mintCount,
  };
}

export async function viewRole(connection: Connection, params: { organization: string; roleName: string; network: Network }) {
  const program = getReadOnlyProgram(connection, params.network);
  const role = getRolePda(new PublicKey(params.organization), params.roleName, params.network);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = await (program.account as any).role.fetch(role);
  const permissions = Number(account.permissions);
  return {
    pda: role.toBase58(),
    organization: account.organization.toBase58(),
    name: account.name,
    permissions,
    permissionsDecoded: decodePermissions(permissions),
    assignmentCount: account.assignmentCount,
  };
}

export async function viewRoleAssignment(
  connection: Connection,
  params: { organization: string; role: string; wallet: string; network: Network },
) {
  const program = getReadOnlyProgram(connection, params.network);
  const roleAssignment = getRoleAssignmentPda(
    new PublicKey(params.organization),
    new PublicKey(params.role),
    new PublicKey(params.wallet),
    params.network,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = await (program.account as any).roleAssignment.fetch(roleAssignment);
  return {
    pda: roleAssignment.toBase58(),
    organization: account.organization.toBase58(),
    role: account.role.toBase58(),
    wallet: account.wallet.toBase58(),
    assignedAt: account.assignedAt.toString(),
    assignedBy: account.assignedBy.toBase58(),
  };
}

export async function viewManagedMint(
  connection: Connection,
  params: { organization: string; mint: string; network: Network },
) {
  const program = getReadOnlyProgram(connection, params.network);
  const managedMint = getManagedMintPda(new PublicKey(params.organization), new PublicKey(params.mint), params.network);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = await (program.account as any).managedMint.fetch(managedMint);
  return {
    pda: managedMint.toBase58(),
    organization: account.organization.toBase58(),
    mint: account.mint.toBase58(),
    tokenType: account.tokenType,
    hasTransferFee: account.hasTransferFee,
    hasTransferHook: account.hasTransferHook,
    hasMemoRequired: account.hasMemoRequired,
    hasTokenAcl: account.hasTokenAcl,
    transferFeeBps: account.transferFeeBps,
    maxTransferFee: account.maxTransferFee.toString(),
    transferHookProgram: account.transferHookProgram.toBase58(),
  };
}

export async function initializeGlobal(connection: Connection, wallet: AnchorWallet, params: { network: Network }) {
  const program = getProgram(connection, wallet, params.network);
  const globalState = getGlobalStatePda(params.network);
  const tx = await program.methods
    .initializeGlobal()
    .accounts({
      authority: wallet.publicKey,
      globalState,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  return { tx, link: solscanLink(tx, params.network), globalState: globalState.toBase58() };
}

export async function createOrg(
  connection: Connection,
  wallet: AnchorWallet,
  params: { name: string; network: Network },
) {
  const program = getProgram(connection, wallet, params.network);
  const globalState = getGlobalStatePda(params.network);
  const organization = getOrganizationPda(wallet.publicKey, params.name, params.network);
  const tx = await program.methods
    .createOrg(params.name)
    .accounts({
      authority: wallet.publicKey,
      globalState,
      organization,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  return { tx, link: solscanLink(tx, params.network), organization: organization.toBase58() };
}

export async function createRole(
  connection: Connection,
  wallet: AnchorWallet,
  params: { organization: string; roleName: string; permissions: number; network: Network },
) {
  const program = getProgram(connection, wallet, params.network);
  const organization = new PublicKey(params.organization);
  const role = getRolePda(organization, params.roleName, params.network);
  const tx = await program.methods
    .createRole(params.roleName, params.permissions)
    .accounts({
      authority: wallet.publicKey,
      organization,
      role,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  return { tx, link: solscanLink(tx, params.network), role: role.toBase58() };
}

export async function assignRole(
  connection: Connection,
  wallet: AnchorWallet,
  params: { organization: string; role: string; targetWallet: string; network: Network },
) {
  const program = getProgram(connection, wallet, params.network);
  const organization = new PublicKey(params.organization);
  const role = new PublicKey(params.role);
  const walletPk = new PublicKey(params.targetWallet);
  const roleAssignment = getRoleAssignmentPda(organization, role, walletPk, params.network);
  const tx = await program.methods
    .assignRole()
    .accounts({
      authority: wallet.publicKey,
      organization,
      role,
      wallet: walletPk,
      roleAssignment,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  return { tx, link: solscanLink(tx, params.network), roleAssignment: roleAssignment.toBase58() };
}

export async function revokeRole(
  connection: Connection,
  wallet: AnchorWallet,
  params: { organization: string; role: string; targetWallet: string; network: Network },
) {
  const program = getProgram(connection, wallet, params.network);
  const organization = new PublicKey(params.organization);
  const role = new PublicKey(params.role);
  const walletPk = new PublicKey(params.targetWallet);
  const roleAssignment = getRoleAssignmentPda(organization, role, walletPk, params.network);
  const tx = await program.methods
    .revokeRole()
    .accounts({
      authority: wallet.publicKey,
      organization,
      role,
      wallet: walletPk,
      roleAssignment,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  return { tx, link: solscanLink(tx, params.network), roleAssignment: roleAssignment.toBase58() };
}

export async function createToken(
  connection: Connection,
  wallet: AnchorWallet,
  params: {
    organization: string;
    tokenType: "fungible" | "nonFungible";
    name: string;
    symbol: string;
    uri: string;
    transferFeeBps?: number;
    maxTransferFee?: string;
    transferHookProgram?: string;
    memoRequired: boolean;
    tokenAclEnabled: boolean;
    network: Network;
  },
) {
  const program = getProgram(connection, wallet, params.network);
  const globalState = getGlobalStatePda(params.network);
  const organization = new PublicKey(params.organization);
  const mint = Keypair.generate();
  const managedMint = getManagedMintPda(organization, mint.publicKey, params.network);

  const tx = await program.methods
    .createToken({
      tokenType: params.tokenType === "fungible" ? { fungible: {} } : { nonFungible: {} },
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
      transferFeeBps: params.transferFeeBps ?? null,
      maxTransferFee: params.maxTransferFee ? new BN(params.maxTransferFee) : null,
      transferHookProgram: params.transferHookProgram ? new PublicKey(params.transferHookProgram) : null,
      memoRequired: params.memoRequired,
      tokenAclEnabled: params.tokenAclEnabled,
    })
    .accounts({
      authority: wallet.publicKey,
      globalState,
      organization,
      mint: mint.publicKey,
      managedMint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([mint])
    .rpc();

  return {
    tx,
    link: solscanLink(tx, params.network),
    mint: mint.publicKey.toBase58(),
    managedMint: managedMint.toBase58(),
  };
}

export async function initializeExtraMetas(
  connection: Connection,
  wallet: AnchorWallet,
  params: { mint: string; network: Network },
) {
  const program = getProgram(connection, wallet, params.network);
  const mint = new PublicKey(params.mint);
  const thawExtraMetas = getThawExtraMetasPda(mint, params.network);
  const freezeExtraMetas = getFreezeExtraMetasPda(mint, params.network);
  const tx = await program.methods
    .initializeExtraMetas()
    .accounts({
      payer: wallet.publicKey,
      mint,
      thawExtraMetas,
      freezeExtraMetas,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return {
    tx,
    link: solscanLink(tx, params.network),
    thawExtraMetas: thawExtraMetas.toBase58(),
    freezeExtraMetas: freezeExtraMetas.toBase58(),
  };
}
