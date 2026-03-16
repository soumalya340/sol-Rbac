use anchor_lang::prelude::*;

// ─────────────────────────────────────────────────────────
//  Global Protocol State
// ─────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct GlobalState {
    pub authority: Pubkey,
    pub total_orgs: u64,
    pub total_mints: u64,
    pub fee_receiver: Pubkey,
    pub bump: u8,
}

// ─────────────────────────────────────────────────────────
//  Organization
// ─────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Organization {
    pub authority: Pubkey,
    #[max_len(32)]
    pub name: String,
    pub role_count: u16,
    pub mint_count: u16,
    pub bump: u8,
}

// ─────────────────────────────────────────────────────────
//  Role Definition
// ─────────────────────────────────────────────────────────

/// Permissions bitmask:
///   bit 0 (1)  = CAN_TRANSFER
///   bit 1 (2)  = CAN_RECEIVE
///   bit 2 (4)  = CAN_FREEZE
///   bit 3 (8)  = CAN_ADMIN
///   bit 4 (16) = CAN_MINT
pub const PERM_CAN_TRANSFER: u16 = 1;
pub const PERM_CAN_RECEIVE: u16 = 2;
pub const PERM_CAN_FREEZE: u16 = 4;
pub const PERM_CAN_ADMIN: u16 = 8;
pub const PERM_CAN_MINT: u16 = 16;

#[account]
#[derive(InitSpace)]
pub struct Role {
    pub organization: Pubkey,
    #[max_len(32)]
    pub name: String,
    pub permissions: u16,
    pub assignment_count: u32,
    pub bump: u8,
}

impl Role {
    pub fn has_permission(&self, perm: u16) -> bool {
        self.permissions & perm == perm
    }
}

// ─────────────────────────────────────────────────────────
//  Role Assignment
// ─────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct RoleAssignment {
    pub organization: Pubkey,
    pub role: Pubkey,
    pub wallet: Pubkey,
    pub assigned_at: i64,
    pub assigned_by: Pubkey,
    pub bump: u8,
}

// ─────────────────────────────────────────────────────────
//  Managed Mint Config
// ─────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct ManagedMint {
    pub organization: Pubkey,
    pub mint: Pubkey,
    pub token_type: u8,
    pub has_transfer_fee: bool,
    pub has_transfer_hook: bool,
    pub has_memo_required: bool,
    pub has_token_acl: bool,
    pub transfer_fee_bps: u16,
    pub max_transfer_fee: u64,
    pub transfer_hook_program: Pubkey,
    pub bump: u8,
}

// ─────────────────────────────────────────────────────────
//  Enums & Args
// ─────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TokenType {
    Fungible,
    NonFungible,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateTokenConfig {
    pub token_type: TokenType,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub transfer_fee_bps: Option<u16>,
    pub max_transfer_fee: Option<u64>,
    pub transfer_hook_program: Option<Pubkey>,
    pub memo_required: bool,
    pub token_acl_enabled: bool,
}

// ─────────────────────────────────────────────────────────
//  Seeds & Constants
// ─────────────────────────────────────────────────────────

pub const GLOBAL_STATE_SEED: &[u8] = b"global_state";
pub const ORG_SEED: &[u8] = b"organization";
pub const ROLE_SEED: &[u8] = b"role";
pub const ROLE_ASSIGNMENT_SEED: &[u8] = b"role_assignment";
pub const MANAGED_MINT_SEED: &[u8] = b"managed_mint";
pub const THAW_EXTRA_METAS_SEED: &[u8] = b"thaw_extra_account_metas";
pub const FREEZE_EXTRA_METAS_SEED: &[u8] = b"freeze_extra_account_metas";
