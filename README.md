# SOL-RBAC: Role-Based Access Control for Solana Tokens

> Rebuild Backend Systems as On-Chain Rust Programs — Solana Bounty Submission

## What This Is

SOL-RBAC is a Solana program that brings traditional RBAC (Role-Based Access Control) on-chain. It combines three things into one unified system:

1. **An RBAC engine** — organizations, roles, permissions, wallet assignments
2. **A Token-2022 factory** — launch tokens (coins or NFTs) with configurable extensions (transfer fees, transfer hooks, memo, Token ACL)
3. **A Token ACL Gate Program** — implements the sRFC37 standard so Token ACL can ask our program "should this wallet be allowed to transact?" and we answer based on their role

The key idea: instead of checking permissions in a backend middleware like Web2 does, permissions live on-chain as verifiable state that any program can read.

---

## The Problem

### In Web2

Every backend system has access control. A user hits an API endpoint, middleware checks their JWT, looks up their role in a database, and decides if they can proceed. This works but it's:

- **Centralized** — the company controls the database, they can silently change your permissions
- **Opaque** — you can't verify what permissions you actually have without trusting the provider
- **Siloed** — your role in System A means nothing in System B, even if they're related

### In Web3 (Current State)

Solana tokens today have two extremes:

- **Fully permissionless** — anyone can transfer, no restrictions. Great for DeFi, terrible for compliance.
- **Fully frozen with manual thaw** — Token-2022's DefaultAccountState extension freezes every new account. The issuer must manually thaw each one. Users wait hours or days. Terrible UX.

There's no middle ground. No way to say "wallets with role X can transact freely, everyone else stays frozen" without building custom infrastructure from scratch.

### The Gap

Token ACL (sRFC37) solves the UX problem — users can self-service thaw if a Gate Program approves them. But the reference Gate Program is just a dumb allow/block list. Manually adding every wallet address doesn't scale.

What's missing is **role-based gating** — define roles with specific permissions, assign roles to wallets, and let Token ACL enforce it automatically.

---

## The Solution

SOL-RBAC fills this gap. It's a Gate Program that Token ACL calls into, but instead of checking a static list, it checks:

1. Does this wallet have a role in the organization?
2. Does that role have the required permission (CAN_TRANSFER, CAN_FREEZE, etc.)?
3. If yes → approve. If no → deny.

### The Flow

```
Organization Admin
    │
    ├── Creates org: "Acme Corp"
    ├── Creates roles: "TRADER" (can transfer), "COMPLIANCE" (can freeze), "ADMIN" (all)
    ├── Creates token via factory: $ACME with Token ACL enabled
    │       → Token-2022 mint with DefaultAccountState = Frozen
    │       → Delegates freeze authority to Token ACL
    │       → Sets SOL-RBAC as the Gate Program
    └── Assigns roles to wallets
            │
            ▼
User with "TRADER" role
    │
    ├── Creates token account (auto-frozen by DefaultAccountState)
    ├── Calls thaw_permissionless on Token ACL
    │       → Token ACL CPIs into SOL-RBAC gate_can_thaw
    │       → SOL-RBAC checks: wallet has "TRADER" role? has CAN_TRANSFER? ✅
    │       → Token ACL thaws the account
    └── Can now send and receive $ACME freely
            │
            ▼
User WITHOUT a role
    │
    ├── Creates token account (auto-frozen)
    ├── Calls thaw_permissionless
    │       → SOL-RBAC checks: no role assignment found ❌
    │       → Token ACL keeps account frozen
    └── Cannot transact
```

### How It's Different from Web2 RBAC

| Aspect                      | Web2 RBAC                      | SOL-RBAC                                        |
| --------------------------- | ------------------------------ | ----------------------------------------------- |
| Where roles live            | Private database               | On-chain PDAs, publicly verifiable              |
| Who checks permissions      | Backend middleware             | Token ACL + Gate Program (trustless)            |
| Can user verify their role? | Only if API exposes it         | Yes, read the blockchain                        |
| Cross-system composability  | None without federation        | Any program can read role PDAs                  |
| Permission enforcement      | Application layer (bypassable) | Protocol layer (Token-2022 freeze, inescapable) |
| Audit trail                 | Application logs (editable)    | On-chain transactions (immutable)               |

---

## Potential Use Cases

### Regulated Token Issuance

A company issues a security token. Only KYC-verified wallets get the "VERIFIED_INVESTOR" role. Token ACL ensures non-verified wallets can never transact with the token. No manual intervention, no waiting.

### DAO Tiered Access

A DAO has contributor tiers: "CORE" (full access), "CONTRIBUTOR" (can transfer), "OBSERVER" (read-only, stays frozen). Members earn roles through governance, and their token access updates automatically.

### Gaming Economies

A game issues in-game currency as a Token-2022 token. Only wallets with "PLAYER" role can transact. Banned players get role revoked → Token ACL freezes their account permissionlessly. Anti-cheat at the protocol level.

### Enterprise Token Gating

Internal company tokens for expense tracking, rewards, or access passes. Only employees (wallets with "EMPLOYEE" role) can hold and transfer them. When someone leaves, revoke the role — done.

### Compliance-First DeFi

A DeFi protocol needs to comply with regulations. The protocol token uses Token ACL + SOL-RBAC. Sanctioned addresses never get a role. Compliant users self-service thaw instantly. Full compliance, zero UX friction.

### Multi-Org Federations

Multiple organizations share a token (like a stablecoin consortium). Each org manages its own roles independently, but they all feed into the same Token ACL gate. Decentralized governance of a shared asset.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         SOL-RBAC                            │
│                                                             │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────────┐    │
│  │  RBAC    │   │  Token   │   │  Gate Program        │    │
│  │  Engine  │   │  Factory │   │  (sRFC37 interface)  │    │
│  │          │   │          │   │                      │    │
│  │  Orgs    │   │  Create  │   │  gate_can_thaw()     │    │
│  │  Roles   │   │  Token22 │   │  gate_can_freeze()   │    │
│  │  Assign  │   │  Mints   │   │                      │    │
│  │  Revoke  │   │  w/ ext  │   │  Checks role PDAs    │    │
│  └────┬─────┘   └────┬─────┘   └──────────┬───────────┘    │
│       │              │                     │                │
│       │         Extensions:                │                │
│       │         • Transfer Fee             │                │
│       │         • Transfer Hook       Called by             │
│       │         • Memo Required      Token ACL              │
│       │         • Token ACL (Frozen)       │                │
│       │              │                     │                │
└───────┼──────────────┼─────────────────────┼────────────────┘
        │              │                     │
        │              ▼                     ▼
        │     ┌─────────────────┐   ┌──────────────────┐
        │     │   Token-2022    │   │    Token ACL     │
        │     │   (Solana SPL)  │   │   (sRFC37)       │
        │     │                 │   │                  │
        │     │   Mint with     │◄──│   Manages freeze │
        │     │   extensions    │   │   authority      │
        │     └─────────────────┘   └──────────────────┘
        │
        ▼
   Role PDAs on-chain
   (publicly readable by any program)
```

---

## Permissions Bitmask

Roles use a u16 bitmask for permissions. Combine them with bitwise OR.

```
Bit 0  (1)  = CAN_TRANSFER   → wallet's token account can be thawed
Bit 1  (2)  = CAN_RECEIVE    → (future) gate incoming transfers
Bit 2  (4)  = CAN_FREEZE     → can freeze other wallets permissionlessly
Bit 3  (8)  = CAN_ADMIN      → can assign/revoke roles
Bit 4  (16) = CAN_MINT       → can mint tokens from managed mints
```

Examples:

- `TRADER` role = `1` (can transfer only)
- `COMPLIANCE_OFFICER` role = `4` (can freeze others)
- `ADMIN` role = `1 | 4 | 8 | 16` = `29` (everything)
- `FULL_ACCESS` role = `31` (all bits set)

---

## File-by-File Breakdown

### Configuration

**`Anchor.toml`**
Anchor framework config. Points to devnet, sets the program ID placeholder, and defines the test script.

**`Cargo.toml` (root)**
Rust workspace definition. Includes the program crate and sets release optimizations (overflow checks, LTO, single codegen unit) for smallest possible on-chain binary.

**`programs/sol-rbac/Cargo.toml`**
Program dependencies. Key ones:

- `anchor-lang` / `anchor-spl` — Anchor framework with Token-2022 support
- `spl-token-2022` — direct access to Token-2022 extension initialization instructions
- `spl-tlv-account-resolution` — for Token ACL extra account metas resolution
- `spl-discriminator` — sRFC37 instruction discriminator computation

### Core Program

**`src/lib.rs`**
The program entrypoint. Declares all 9 instructions and routes them to their handlers:

- `initialize_global` — one-time protocol setup
- `create_org` — new organization
- `create_role` — define a role with permissions bitmask
- `assign_role` — give a wallet a role
- `revoke_role` — remove a role from a wallet
- `create_token` — Token-2022 factory with extension config
- `gate_can_thaw` — sRFC37 gate: "can this wallet thaw?"
- `gate_can_freeze` — sRFC37 gate: "can this caller freeze someone?"
- `initialize_extra_metas` — setup for Token ACL account resolution

### State

**`src/state.rs`**
All on-chain account structures:

- **`GlobalState`** — singleton PDA (`seeds: ["global_state"]`). Tracks protocol-wide counters (total orgs, total mints) and the protocol authority. Created once.

- **`Organization`** — PDA per org (`seeds: ["organization", authority, name]`). Stores the org admin, name, and counts of roles/mints. Each organization is an independent RBAC domain.

- **`Role`** — PDA per role (`seeds: ["role", org_key, role_name]`). Stores the permission bitmask and assignment count. The permissions determine what Token ACL operations this role grants.

- **`RoleAssignment`** — PDA per wallet-role pair (`seeds: ["role_assignment", org_key, role_key, wallet]`). The existence of this account IS the proof that the wallet has the role. No account = no role. This is what the gate program checks.

- **`ManagedMint`** — PDA per mint (`seeds: ["managed_mint", org_key, mint_key]`). Tracks which Token-2022 extensions were enabled and their configuration. Links the mint back to its organization.

- **`TokenType`** — enum: `Fungible` (decimals=9) or `NonFungible` (decimals=0, supply=1).

- **`CreateTokenConfig`** — instruction args struct for the token factory. User picks token type, metadata, and which extensions to enable.

- **Permission constants** — `PERM_CAN_TRANSFER`, `PERM_CAN_RECEIVE`, `PERM_CAN_FREEZE`, `PERM_CAN_ADMIN`, `PERM_CAN_MINT`. Used for bitmask checks.

- **Seed constants** — all PDA seed prefixes defined here for consistency.

### Errors

**`src/errors.rs`**
All custom error codes with human-readable messages. Covers auth failures, invalid configs, role management errors, and gate-specific denials (ThawNotPermitted, FreezeNotPermitted).

### Instructions

**`src/instructions/mod.rs`**
Module declarations and re-exports for all instruction files.

**`src/instructions/initialize_global.rs`**
Creates the GlobalState singleton PDA. Sets the caller as protocol authority and fee receiver. Called once on deployment.

**`src/instructions/create_org.rs`**
Creates an Organization PDA. The signer becomes the org authority (admin). Validates name length (max 32 bytes). Increments the global org counter.

**`src/instructions/create_role.rs`**
Creates a Role PDA under an organization. Only the org authority can call this. Takes a role name and permissions bitmask. The bitmask determines what Token ACL operations wallets with this role can perform.

**`src/instructions/assign_role.rs`**
Creates a RoleAssignment PDA linking a wallet to a role. Only org authority can call. Records who assigned it and when. The PDA's existence is the on-chain proof — if it exists, the wallet has the role.

**`src/instructions/revoke_role.rs`**
Closes the RoleAssignment PDA (using Anchor's `close` constraint). Returns the rent SOL to the authority. Once closed, the wallet no longer has the role and the gate program will deny them.

**`src/instructions/create_token.rs`**
The Token-2022 factory. This is the most complex instruction. It:

1. Calculates total mint account size based on selected extensions
2. Creates the mint account owned by Token-2022 program
3. Initializes extensions in the required order (before mint init):
   - MetadataPointer (always — points to self for on-chain metadata)
   - TransferFeeConfig (if `transfer_fee_bps` is set)
   - TransferHook (if `transfer_hook_program` is set)
   - DefaultAccountState = Frozen (if `token_acl_enabled` is true)
4. Initializes the mint itself (with correct decimals for coin vs NFT)
5. Initializes token metadata (name, symbol, URI stored on the mint)
6. Stores the ManagedMint PDA tracking the configuration

After this instruction, the org authority must separately call Token ACL's `create_config` to delegate freeze authority, and set this program as the gating program.

**`src/instructions/gate_can_thaw.rs`**
The sRFC37 CanThawPermissionless handler. This is what Token ACL calls when a user tries to thaw their account. Account layout follows sRFC37 spec:

- First 6 accounts are fixed (authority, token_account, mint, token_account_owner, flag_account, extra_metas)
- Remaining 3 are our RBAC accounts (organization, role, role_assignment)

The logic: verify the flag account is set (reentrancy guard), then check that the token_account_owner has a RoleAssignment for a Role with CAN_TRANSFER permission. If yes → `Ok(())` (allow thaw). If any check fails → error (deny thaw).

**`src/instructions/gate_can_freeze.rs`**
Same structure as gate_can_thaw but checks the CALLER's permissions, not the token account owner's. For thaw, we ask "does the owner deserve access?" For freeze, we ask "does the caller have authority to freeze someone?" Checks for CAN_FREEZE permission.

**`src/instructions/initialize_extra_metas.rs`**
Sets up the ExtraAccountMetas PDAs that Token ACL reads to resolve additional accounts. For the MVP, these are empty — the client-side SDK resolves the RBAC accounts and passes them as remaining_accounts. A full implementation would encode the organization, role, and role_assignment PDAs using `spl_tlv_account_resolution` so Token ACL resolves them automatically.

---

## Tradeoffs & Constraints

### Solana vs Web2

| Constraint            | Impact                                          | Mitigation                                       |
| --------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Account size limits   | Role names max 32 bytes, org names max 32 bytes | Sufficient for practical use                     |
| PDA per assignment    | Each wallet-role pair costs ~0.002 SOL rent     | Rent is recoverable on revocation                |
| No push notifications | Can't alert users when roles change             | Client polls or uses websocket subscriptions     |
| Transaction size      | Gate check adds accounts to the thaw TX         | Kept to 3 extra accounts (org, role, assignment) |
| Compute units         | Gate CPI adds ~50k CU to thaw operation         | Well within 200k default limit                   |

### Design Decisions

**Why PDA-based roles instead of soulbound tokens?**
PDAs are simpler, cheaper, and directly queryable. Soulbound tokens require minting, ATAs, and metadata — more accounts, more rent, more complexity. The PDA existence check is O(1) and costs nothing to verify.

**Why a bitmask for permissions instead of separate role types?**
Bitmasks are composable. A single role can grant multiple permissions. Adding new permission types doesn't require schema changes — just use the next bit. And the check is a single bitwise AND, which is extremely CU-efficient.

**Why empty extra metas (client-side resolution)?**
The RBAC accounts depend on which organization and role the wallet belongs to. This is dynamic — Token ACL's account resolution can't know which org/role to look up without additional context. Client-side resolution is the pragmatic MVP approach. Full automation would require encoding the mint → org mapping into the extra metas.

---

## Setup & Deploy

```bash
# Install dependencies
anchor build

# Generate a new program keypair (or use existing)
solana-keygen new -o target/deploy/sol_rbac-keypair.json

# Get the program ID
solana address -k target/deploy/sol_rbac-keypair.json

# Update declare_id! in lib.rs and Anchor.toml with the actual program ID

# Deploy to devnet
anchor deploy --provider.cluster devnet

# After deploy, initialize global state
# (via CLI or test script)
```

---

## Token ACL Integration Steps

After deploying SOL-RBAC and creating your token with `token_acl_enabled: true`:

```bash
# 1. Install Token ACL CLI
cargo install token-acl-cli

# 2. Create Token ACL config (delegates freeze authority to Token ACL)
token-acl-cli create-config <MINT_ADDRESS> --gating-program <YOUR_SOL_RBAC_PROGRAM_ID>

# 3. Enable permissionless thaw
token-acl-cli set-instructions <MINT_ADDRESS> --enable-thaw

# 4. Now users with CAN_TRANSFER role can self-service thaw:
token-acl-cli thaw-permissionless --mint <MINT_ADDRESS> --owner <WALLET>
# (client must pass org, role, role_assignment as remaining accounts)
```

---

## Tech Stack

- **Language**: Rust
- **Framework**: Anchor 0.30.1
- **Token Standard**: SPL Token-2022 (Token Extensions)
- **Access Control Standard**: sRFC37 (Token ACL)
- **Network**: Solana Devnet
- **Extensions Used**: MetadataPointer, TransferFeeConfig, TransferHook, DefaultAccountState

---

## License

MIT
