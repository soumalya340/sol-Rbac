'use client';

import { useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Providers, getRpcEndpoint } from "./providers";
import {
  PERMISSIONS,
  encodePermissions,
  viewGlobalState,
  viewOrganization,
  viewRole,
  viewRoleAssignment,
  viewManagedMint,
  initializeGlobal,
  createOrg,
  createRole,
  assignRole,
  revokeRole,
  createToken,
  initializeExtraMetas,
  type Network,
} from "@/lib/rbac";
import {
  TOKEN_ACL_INFO,
  viewTokenAclConfig,
  createTokenAclConfig,
  toggleTokenAclPermissionless,
} from "@/lib/tokenAcl";

type SectionId = "view" | "user" | "admin" | "tokenAcl";

interface FieldDef {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "number" | "select";
  options?: { label: string; value: string }[];
  hint?: string;
}

interface FunctionDef {
  id: string;
  number: string;
  title: string;
  description: string;
  fields: FieldDef[];
  submitLabel: string;
}

const VIEW_FUNCTIONS: FunctionDef[] = [
  {
    id: "view_global_state",
    number: "1A",
    title: "View Global State",
    description: "Fetch global RBAC state with authority and counters.",
    fields: [],
    submitLabel: "Fetch Global State",
  },
  {
    id: "view_organization",
    number: "1B",
    title: "View Organization",
    description: "Fetch organization by authority pubkey + organization name.",
    fields: [
      { name: "authority", label: "Authority Pubkey", placeholder: "Authority wallet address" },
      { name: "name", label: "Organization Name", placeholder: "acme-dev" },
    ],
    submitLabel: "Fetch Organization",
  },
  {
    id: "view_role",
    number: "1C",
    title: "View Role",
    description: "Fetch role data for an organization + role name.",
    fields: [
      { name: "organization", label: "Organization PDA", placeholder: "Organization PDA" },
      { name: "role_name", label: "Role Name", placeholder: "TRADER" },
    ],
    submitLabel: "Fetch Role",
  },
  {
    id: "view_managed_mint",
    number: "1D",
    title: "View Managed Mint",
    description: "Fetch metadata for a mint managed by an organization.",
    fields: [
      { name: "organization", label: "Organization PDA", placeholder: "Organization PDA" },
      { name: "mint", label: "Mint Address", placeholder: "Token-2022 mint" },
    ],
    submitLabel: "Fetch Managed Mint",
  },
];

const USER_FUNCTIONS: FunctionDef[] = [
  {
    id: "view_role_assignment",
    number: "2A",
    title: "Check Role Assignment",
    description: "Look up whether a wallet has a specific role in an organization.",
    fields: [
      { name: "organization", label: "Organization PDA", placeholder: "Organization PDA" },
      { name: "role", label: "Role PDA", placeholder: "Role PDA" },
      { name: "wallet", label: "Wallet Pubkey", placeholder: "Wallet address" },
    ],
    submitLabel: "Check Assignment",
  },
];

const ADMIN_FUNCTIONS: FunctionDef[] = [
  {
    id: "initialize_global",
    number: "3A",
    title: "Initialize Global",
    description: "One-time setup for the RBAC global state account.",
    fields: [],
    submitLabel: "Initialize Global",
  },
  {
    id: "create_org",
    number: "3B",
    title: "Create Organization",
    description: "Create a new organization PDA under connected authority.",
    fields: [{ name: "name", label: "Organization Name", placeholder: "acme-dev" }],
    submitLabel: "Create Organization",
  },
  {
    id: "create_role",
    number: "3C",
    title: "Create Role",
    description: "Create a role with permission bitmask for an organization.",
    fields: [
      { name: "organization", label: "Organization PDA", placeholder: "Organization PDA" },
      { name: "role_name", label: "Role Name", placeholder: "TRADER" },
    ],
    submitLabel: "Create Role",
  },
  {
    id: "assign_role",
    number: "3D",
    title: "Assign Role",
    description: "Assign a role to a wallet.",
    fields: [
      { name: "organization", label: "Organization PDA", placeholder: "Organization PDA" },
      { name: "role", label: "Role PDA", placeholder: "Role PDA" },
      { name: "target_wallet", label: "Target Wallet", placeholder: "Wallet address" },
    ],
    submitLabel: "Assign Role",
  },
  {
    id: "revoke_role",
    number: "3E",
    title: "Revoke Role",
    description: "Revoke a role from a wallet.",
    fields: [
      { name: "organization", label: "Organization PDA", placeholder: "Organization PDA" },
      { name: "role", label: "Role PDA", placeholder: "Role PDA" },
      { name: "target_wallet", label: "Target Wallet", placeholder: "Wallet address" },
    ],
    submitLabel: "Revoke Role",
  },
  {
    id: "create_token",
    number: "3F",
    title: "Create Token",
    description: "Create managed Token-2022 mint with optional extensions.",
    fields: [
      { name: "organization", label: "Organization PDA", placeholder: "Organization PDA" },
      {
        name: "token_type",
        label: "Token Type",
        type: "select",
        options: [
          { label: "Fungible", value: "fungible" },
          { label: "Non-Fungible", value: "nonFungible" },
        ],
      },
      { name: "name", label: "Name", placeholder: "RBAC Coin" },
      { name: "symbol", label: "Symbol", placeholder: "RBC" },
      { name: "uri", label: "Metadata URI", placeholder: "https://example.com/metadata.json" },
      { name: "transfer_fee_bps", label: "Transfer Fee BPS (optional)", placeholder: "25", type: "number" },
      { name: "max_transfer_fee", label: "Max Transfer Fee (optional)", placeholder: "1000", type: "number" },
      { name: "transfer_hook_program", label: "Transfer Hook Program (optional)", placeholder: "Program pubkey" },
      {
        name: "memo_required",
        label: "Memo Required",
        type: "select",
        options: [
          { label: "No", value: "false" },
          { label: "Yes", value: "true" },
        ],
      },
      {
        name: "token_acl_enabled",
        label: "Token ACL Enabled",
        type: "select",
        options: [
          { label: "No", value: "false" },
          { label: "Yes", value: "true" },
        ],
      },
    ],
    submitLabel: "Create Token",
  },
  {
    id: "initialize_extra_metas",
    number: "3G",
    title: "Initialize Extra Metas",
    description: "Initialize thaw/freeze extra metas PDAs for a mint.",
    fields: [{ name: "mint", label: "Mint Address", placeholder: "Token-2022 mint" }],
    submitLabel: "Initialize Extra Metas",
  },
];

const TOKEN_ACL_FUNCTIONS: FunctionDef[] = [
  {
    id: "token_acl_view_config",
    number: "4A",
    title: "View Token ACL Config",
    description: "Fetch Token ACL mint config PDA for a mint and decode its settings.",
    fields: [{ name: "mint", label: "Mint Address", placeholder: "Token-2022 mint address" }],
    submitLabel: "View Config",
  },
  {
    id: "token_acl_create_config",
    number: "4B",
    title: "Create Token ACL Config",
    description: "Create Token ACL mint config and set the RBAC gating program for this mint.",
    fields: [
      { name: "mint", label: "Mint Address", placeholder: "Token-2022 mint address" },
      {
        name: "gating_program",
        label: "Gating Program",
        placeholder: "RBAC program ID",
        hint: "Defaults to your current RBAC program ID if empty.",
      },
    ],
    submitLabel: "Create Config",
  },
  {
    id: "token_acl_toggle_permissionless",
    number: "4C",
    title: "Toggle Permissionless Modes",
    description: "Enable/disable permissionless freeze and thaw for a mint config.",
    fields: [
      { name: "mint", label: "Mint Address", placeholder: "Token-2022 mint address" },
      {
        name: "freeze_enabled",
        label: "Freeze Enabled",
        type: "select",
        options: [
          { label: "false", value: "false" },
          { label: "true", value: "true" },
        ],
      },
      {
        name: "thaw_enabled",
        label: "Thaw Enabled",
        type: "select",
        options: [
          { label: "false", value: "false" },
          { label: "true", value: "true" },
        ],
      },
    ],
    submitLabel: "Toggle Permissionless",
  },
];

const REQUIRES_WALLET = new Set([
  "initialize_global",
  "create_org",
  "create_role",
  "assign_role",
  "revoke_role",
  "create_token",
  "initialize_extra_metas",
  "token_acl_create_config",
  "token_acl_toggle_permissionless",
]);

const PERMISSION_OPTIONS = [
  { label: "CAN_TRANSFER", value: PERMISSIONS.CAN_TRANSFER },
  { label: "CAN_RECEIVE", value: PERMISSIONS.CAN_RECEIVE },
  { label: "CAN_FREEZE", value: PERMISSIONS.CAN_FREEZE },
  { label: "CAN_ADMIN", value: PERMISSIONS.CAN_ADMIN },
  { label: "CAN_MINT", value: PERMISSIONS.CAN_MINT },
];

const SECTION_STYLE: Record<SectionId, { badge: string; accent: string; glow: string }> = {
  view: { badge: "bg-cyan-900/60 text-cyan-300 border-cyan-700/50", accent: "#06b6d4", glow: "rgba(6,182,212,0.15)" },
  user: { badge: "bg-violet-900/60 text-violet-300 border-violet-700/50", accent: "#8b5cf6", glow: "rgba(139,92,246,0.15)" },
  admin: { badge: "bg-rose-900/60 text-rose-300 border-rose-700/50", accent: "#f43f5e", glow: "rgba(244,63,94,0.15)" },
  tokenAcl: { badge: "bg-amber-900/60 text-amber-300 border-amber-700/50", accent: "#f59e0b", glow: "rgba(245,158,11,0.15)" },
};

function formatResult(data: unknown): string {
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}

function AccordionItem({ fn, section, network }: { fn: FunctionDef; section: SectionId; network: Network }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [selectedPerms, setSelectedPerms] = useState<number[]>([PERMISSIONS.CAN_TRANSFER]);
  const [result, setResult] = useState<{ type: "info" | "success" | "error"; text: string; solscan?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const style = SECTION_STYLE[section];
  const needsWallet = REQUIRES_WALLET.has(fn.id);

  const togglePerm = (bit: number) => {
    setSelectedPerms((prev) => (prev.includes(bit) ? prev.filter((x) => x !== bit) : [...prev, bit]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (needsWallet && !connected) {
      setVisible(true);
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      let data: unknown;

      if (fn.id === "view_global_state") {
        data = await viewGlobalState(connection, network);
      } else if (fn.id === "view_organization") {
        data = await viewOrganization(connection, {
          authority: values.authority,
          name: values.name,
          network,
        });
      } else if (fn.id === "view_role") {
        data = await viewRole(connection, {
          organization: values.organization,
          roleName: values.role_name,
          network,
        });
      } else if (fn.id === "view_role_assignment") {
        data = await viewRoleAssignment(connection, {
          organization: values.organization,
          role: values.role,
          wallet: values.wallet,
          network,
        });
      } else if (fn.id === "view_managed_mint") {
        data = await viewManagedMint(connection, {
          organization: values.organization,
          mint: values.mint,
          network,
        });
      } else if (fn.id === "initialize_global") {
        const r = await initializeGlobal(connection, anchorWallet!, { network });
        data = { tx: r.tx, globalState: r.globalState, solscan: r.link };
      } else if (fn.id === "create_org") {
        const r = await createOrg(connection, anchorWallet!, { name: values.name, network });
        data = { tx: r.tx, organization: r.organization, solscan: r.link };
      } else if (fn.id === "create_role") {
        const r = await createRole(connection, anchorWallet!, {
          organization: values.organization,
          roleName: values.role_name,
          permissions: encodePermissions(selectedPerms),
          network,
        });
        data = {
          tx: r.tx,
          role: r.role,
          permissionMask: encodePermissions(selectedPerms),
          selectedPermissions: selectedPerms,
          solscan: r.link,
        };
      } else if (fn.id === "assign_role") {
        const r = await assignRole(connection, anchorWallet!, {
          organization: values.organization,
          role: values.role,
          targetWallet: values.target_wallet,
          network,
        });
        data = { tx: r.tx, roleAssignment: r.roleAssignment, solscan: r.link };
      } else if (fn.id === "revoke_role") {
        const r = await revokeRole(connection, anchorWallet!, {
          organization: values.organization,
          role: values.role,
          targetWallet: values.target_wallet,
          network,
        });
        data = { tx: r.tx, roleAssignment: r.roleAssignment, solscan: r.link };
      } else if (fn.id === "create_token") {
        const r = await createToken(connection, anchorWallet!, {
          organization: values.organization,
          tokenType: (values.token_type as "fungible" | "nonFungible") || "fungible",
          name: values.name,
          symbol: values.symbol,
          uri: values.uri,
          transferFeeBps: values.transfer_fee_bps ? Number(values.transfer_fee_bps) : undefined,
          maxTransferFee: values.max_transfer_fee || undefined,
          transferHookProgram: values.transfer_hook_program || undefined,
          memoRequired: values.memo_required === "true",
          tokenAclEnabled: values.token_acl_enabled === "true",
          network,
        });
        data = { tx: r.tx, mint: r.mint, managedMint: r.managedMint, solscan: r.link };
      } else if (fn.id === "initialize_extra_metas") {
        const r = await initializeExtraMetas(connection, anchorWallet!, {
          mint: values.mint,
          network,
        });
        data = {
          tx: r.tx,
          thawExtraMetas: r.thawExtraMetas,
          freezeExtraMetas: r.freezeExtraMetas,
          solscan: r.link,
        };
      } else if (fn.id === "token_acl_view_config") {
        data = await viewTokenAclConfig(connection, { mint: values.mint });
      } else if (fn.id === "token_acl_create_config") {
        const r = await createTokenAclConfig(connection, anchorWallet!, {
          mint: values.mint,
          gatingProgram: values.gating_program || (process.env.NEXT_PUBLIC_RBAC_PROGRAM_ID_DEVNET ?? "D2JP3gdSTbRYi58Kdr3TAhwnvQz1u8zfD5mkQYavV1cm"),
          network,
        });
        data = { tx: r.tx, mintConfig: r.mintConfig, solscan: r.link };
      } else if (fn.id === "token_acl_toggle_permissionless") {
        const r = await toggleTokenAclPermissionless(connection, anchorWallet!, {
          mint: values.mint,
          freezeEnabled: values.freeze_enabled === "true",
          thawEnabled: values.thaw_enabled === "true",
          network,
        });
        data = { tx: r.tx, mintConfig: r.mintConfig, solscan: r.link };
      }

      const solscanUrl = data && typeof data === "object" && "solscan" in data ? (data as { solscan: string }).solscan : undefined;
      const displayData = solscanUrl ? { ...((data as object) || {}), solscan: undefined } : data;
      setResult({ type: "success", text: formatResult(displayData), solscan: solscanUrl });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRejection =
        msg.toLowerCase().includes("user rejected") ||
        msg.toLowerCase().includes("rejected the request") ||
        msg.toLowerCase().includes("transaction cancelled") ||
        msg.toLowerCase().includes("transaction canceled") ||
        (err as { code?: number })?.code === 4001;
      setResult({
        type: isRejection ? "info" : "error",
        text: isRejection ? "Transaction cancelled — you rejected the wallet signing request." : msg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-xl border transition-all duration-200"
      style={{
        borderColor: open ? `${style.accent}55` : "#1e1e30",
        boxShadow: open ? `0 0 20px ${style.glow}` : "none",
        background: "#0e0e1a",
      }}
    >
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-4 px-5 py-4 text-left group">
        <span
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold tracking-wide"
          style={{ background: `${style.accent}22`, color: style.accent, border: `1px solid ${style.accent}44` }}
        >
          {fn.number}
        </span>
        <span className="flex-1 font-semibold text-white/90 group-hover:text-white transition-colors">{fn.title}</span>
        <span
          className="flex-shrink-0 text-lg transition-transform duration-200 select-none"
          style={{ color: style.accent, transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          &#8964;
        </span>
      </button>

      <div className={`accordion-content ${open ? "open" : ""}`}>
        <form onSubmit={handleSubmit} className="px-5 pb-5 pt-1 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed border-l-2 pl-3" style={{ borderColor: `${style.accent}66` }}>
            {fn.description}
          </p>

          {fn.fields.length === 0 && <p className="text-xs text-slate-500 italic">No parameters required.</p>}

          {needsWallet && !connected && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: "#161626", border: "1px solid #2a2a40", color: "#94a3b8" }}>
              <span>Connect your wallet to execute this function.</span>
            </div>
          )}

          {needsWallet && connected && publicKey && (
            <div
              className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="font-mono">{publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-6)}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fn.fields.map((field) => (
              <div key={field.name}>
                <label className="block text-xs font-medium text-slate-300 mb-1">{field.label}</label>
                {field.type === "select" ? (
                  <select
                    value={values[field.name] ?? field.options?.[0]?.value ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white appearance-none cursor-pointer"
                    style={{ background: "#161626", border: "1px solid #2a2a40" }}
                  >
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type ?? "text"}
                    placeholder={field.placeholder}
                    value={values[field.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600"
                    style={{ background: "#161626", border: "1px solid #2a2a40" }}
                  />
                )}
                {field.hint && <p className="mt-1 text-xs text-slate-500">{field.hint}</p>}
              </div>
            ))}
          </div>

          {fn.id === "create_role" && (
            <div className="rounded-lg border p-3" style={{ borderColor: "#2a2a40", background: "#161626" }}>
              <p className="text-xs font-semibold text-slate-300 mb-2">Permissions</p>
              <div className="grid grid-cols-2 gap-2">
                {PERMISSION_OPTIONS.map((perm) => (
                  <label key={perm.value} className="text-xs text-slate-300 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedPerms.includes(perm.value)}
                      onChange={() => togglePerm(perm.value)}
                    />
                    {perm.label} ({perm.value})
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">Current bitmask: {encodePermissions(selectedPerms)}</p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading ? "#2a2a40" : `linear-gradient(135deg, ${style.accent}, ${style.accent}cc)`,
                boxShadow: loading ? "none" : `0 0 12px ${style.glow}`,
              }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </span>
              ) : needsWallet && !connected ? "Connect Wallet" : fn.submitLabel}
            </button>
          </div>

          {result && (
            <div
              className="rounded-lg px-4 py-3 text-xs font-mono whitespace-pre-wrap leading-relaxed break-all"
              style={{
                background: result.type === "error" ? "#1a0a0a" : result.type === "success" ? "#0a1a0a" : "#0a0a1a",
                border: `1px solid ${result.type === "error" ? "#7f1d1d" : result.type === "success" ? "#14532d" : "#1e3a5f"}`,
                color: result.type === "error" ? "#fca5a5" : result.type === "success" ? "#86efac" : "#93c5fd",
              }}
            >
              {result.text}
              {result.solscan && (
                <div className="mt-2 pt-2" style={{ borderTop: "1px solid #14532d" }}>
                  <a href={result.solscan} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#4ade80" }}>
                    View on Solscan ↗
                  </a>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function SectionBlock({
  id,
  label,
  icon,
  functions,
  network,
}: {
  id: SectionId;
  label: string;
  icon: string;
  functions: FunctionDef[];
  network: Network;
}) {
  const style = SECTION_STYLE[id];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xl" dangerouslySetInnerHTML={{ __html: icon }} />
        <h2 className="text-lg font-bold text-white tracking-wide">{label}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${style.badge}`}>{functions.length} functions</span>
        <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${style.accent}44, transparent)` }} />
      </div>

      <div className="space-y-2">
        {functions.map((fn) => (
          <AccordionItem key={fn.id} fn={fn} section={id} network={network} />
        ))}
      </div>
    </div>
  );
}

function NetworkToggle({ network, setNetwork }: { network: Network; setNetwork: (n: Network) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "#0e0e1a", border: "1px solid #1e1e30" }}>
      <button
        onClick={() => setNetwork("devnet")}
        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
          network === "devnet" ? "text-white" : "text-slate-500 hover:text-slate-300"
        }`}
        style={network === "devnet" ? { background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 0 12px rgba(124,58,237,0.4)" } : {}}
      >
        Devnet
      </button>
      <button
        onClick={() => setNetwork("mainnet")}
        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
          network === "mainnet" ? "text-white" : "text-slate-500 hover:text-slate-300"
        }`}
        style={network === "mainnet" ? { background: "linear-gradient(135deg, #dc2626, #b91c1c)", boxShadow: "0 0 12px rgba(220,38,38,0.4)" } : {}}
      >
        Mainnet
      </button>
    </div>
  );
}

function WalletButton() {
  const { publicKey, connected, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [showMenu, setShowMenu] = useState(false);

  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-150"
        style={{ background: "linear-gradient(135deg, #7c3aed, #06b6d4)", boxShadow: "0 0 16px rgba(124,58,237,0.35)" }}
      >
        <span>Connect Wallet</span>
      </button>
    );
  }

  const short = `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`;
  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu((m) => !m)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
        style={{ background: "#0e0e1a", border: "1px solid rgba(139,92,246,0.4)", color: "#a78bfa" }}
      >
        {wallet?.adapter.icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.adapter.icon} alt={wallet.adapter.name} className="w-4 h-4 rounded" />
        )}
        <span className="font-mono">{short}</span>
        <span className="text-slate-500 text-xs">&#8964;</span>
      </button>

      {showMenu && (
        <div
          className="absolute right-0 top-full mt-2 rounded-xl overflow-hidden z-50 min-w-[180px]"
          style={{ background: "#0e0e1a", border: "1px solid #1e1e30", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: "#1e1e30" }}>
            <p className="text-xs text-slate-500">Connected via {wallet?.adapter.name}</p>
            <p className="text-xs font-mono text-slate-300 mt-0.5 truncate">{publicKey.toBase58()}</p>
          </div>
          <button onClick={() => { disconnect(); setShowMenu(false); }} className="w-full px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-900/20 transition-colors">
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

const TABS: { id: SectionId; label: string; icon: string }[] = [
  { id: "view", label: "View", icon: "&#128269;" },
  { id: "user", label: "User", icon: "&#128100;" },
  { id: "admin", label: "Admin", icon: "&#128274;" },
  { id: "tokenAcl", label: "Token ACL", icon: "&#129511;" },
];

export default function Home() {
  const [network, setNetwork] = useState<Network>("devnet");
  return (
    <Providers key={network} endpoint={getRpcEndpoint(network)}>
      <HomeInner network={network} setNetwork={setNetwork} />
    </Providers>
  );
}

function HomeInner({ network, setNetwork }: { network: Network; setNetwork: (n: Network) => void }) {
  const [activeTab, setActiveTab] = useState<SectionId>("view");

  return (
    <div className="min-h-screen" style={{ background: "#07070f" }}>
      <header
        className="sticky top-0 z-10 px-6 py-4"
        style={{ background: "rgba(7,7,15,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid #1e1e30" }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ background: "linear-gradient(135deg, #7c3aed, #06b6d4)" }}>
              RB
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-none">RBAC</h1>
              <p className="text-xs text-slate-400 leading-none mt-0.5">Solana Role Management</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NetworkToggle network={network} setNetwork={setNetwork} />
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              background: network === "devnet" ? "rgba(124,58,237,0.15)" : "rgba(220,38,38,0.15)",
              color: network === "devnet" ? "#a78bfa" : "#f87171",
              border: `1px solid ${network === "devnet" ? "#7c3aed44" : "#dc262644"}`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: network === "devnet" ? "#7c3aed" : "#dc2626" }} />
            {network === "devnet" ? "Devnet" : "Mainnet"}
          </span>
          <span className="text-xs text-slate-500">{network === "devnet" ? "Connected to Solana Devnet" : "Connected to Solana Mainnet"}</span>
        </div>

        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "#0e0e1a", border: "1px solid #1e1e30" }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            const s = SECTION_STYLE[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
                style={
                  active
                    ? { background: `${s.accent}22`, color: s.accent, border: `1px solid ${s.accent}44` }
                    : { color: "#64648a", border: "1px solid transparent" }
                }
              >
                <span dangerouslySetInnerHTML={{ __html: tab.icon }} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-10">
          <div
            className="rounded-lg border px-3 py-2 text-xs"
            style={{ borderColor: "#2a2a40", background: "#111122", color: "#a3a3b7" }}
          >
            Token ACL Program: <span className="font-mono">{TOKEN_ACL_INFO.programId}</span>
          </div>
          {activeTab === "view" && <SectionBlock id="view" label="View" icon="&#128269;" functions={VIEW_FUNCTIONS} network={network} />}
          {activeTab === "user" && <SectionBlock id="user" label="User Functions" icon="&#128100;" functions={USER_FUNCTIONS} network={network} />}
          {activeTab === "admin" && <SectionBlock id="admin" label="Admin Functions" icon="&#128274;" functions={ADMIN_FUNCTIONS} network={network} />}
          {activeTab === "tokenAcl" && <SectionBlock id="tokenAcl" label="Token ACL Functions" icon="&#129511;" functions={TOKEN_ACL_FUNCTIONS} network={network} />}
        </div>

        <footer className="pt-8 border-t text-center text-xs text-slate-600" style={{ borderColor: "#1e1e30" }}>
          RBAC Program UI &mdash; Solana {network === "devnet" ? "Devnet" : "Mainnet"} &mdash; v0.1.0
        </footer>
      </main>
    </div>
  );
}
