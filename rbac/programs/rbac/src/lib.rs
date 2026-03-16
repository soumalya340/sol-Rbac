use anchor_lang::prelude::*;

declare_id!("D2JP3gdSTbRYi58Kdr3TAhwnvQz1u8zfD5mkQYavV1cm");

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

#[program]
pub mod sol_rbac {
    use super::*;

    // ─────────────────────────────────────────────────────
    //  Protocol Admin
    // ─────────────────────────────────────────────────────

    pub fn initialize_global(ctx: Context<InitializeGlobal>) -> Result<()> {
        instructions::initialize_global::handler(ctx)
    }

    // ─────────────────────────────────────────────────────
    //  Organization Management
    // ─────────────────────────────────────────────────────

    pub fn create_org(ctx: Context<CreateOrg>, name: String) -> Result<()> {
        instructions::create_org::handler(ctx, name)
    }

    // ─────────────────────────────────────────────────────
    //  Role Management (RBAC Core)
    // ─────────────────────────────────────────────────────

    /// Permission bits:
    ///   1  = CAN_TRANSFER  (account gets thawed via Token ACL)
    ///   2  = CAN_RECEIVE   (future: gate incoming transfers)
    ///   4  = CAN_FREEZE    (can freeze others permissionlessly)
    ///   8  = CAN_ADMIN     (can assign/revoke roles)
    ///   16 = CAN_MINT      (can mint tokens from managed mints)
    pub fn create_role(
        ctx: Context<CreateRole>,
        role_name: String,
        permissions: u16,
    ) -> Result<()> {
        instructions::create_role::handler(ctx, role_name, permissions)
    }

    pub fn assign_role(ctx: Context<AssignRole>) -> Result<()> {
        instructions::assign_role::handler(ctx)
    }

    pub fn revoke_role(ctx: Context<RevokeRole>) -> Result<()> {
        instructions::revoke_role::handler(ctx)
    }

    // ─────────────────────────────────────────────────────
    //  Token Factory (Token-2022 with Extensions)
    // ─────────────────────────────────────────────────────

    /// Create a new Token-2022 mint with configurable extensions.
    /// Supports: Coin (decimals=9) or NFT (decimals=0, supply=1)
    /// Extensions: TransferFee, TransferHook, MemoRequired, TokenACL
    ///
    /// If token_acl_enabled = true:
    ///   - DefaultAccountState is set to Frozen
    ///   - Freeze authority stays with org authority initially
    ///   - Call Token ACL's create_config separately to delegate freeze authority
    ///   - Set this program as the gating_program on Token ACL
    pub fn create_token(ctx: Context<CreateToken>, config: CreateTokenConfig) -> Result<()> {
        instructions::create_token::handler(ctx, config)
    }

    // ─────────────────────────────────────────────────────
    //  Token ACL Gate (sRFC37 Interface)
    // ─────────────────────────────────────────────────────

    /// Called by Token ACL when user tries to permissionlessly thaw.
    /// Checks if token_account_owner has a role with CAN_TRANSFER.
    pub fn gate_can_thaw(ctx: Context<GateCanThaw>) -> Result<()> {
        instructions::gate_can_thaw::handler(ctx)
    }

    /// Called by Token ACL when someone tries to permissionlessly freeze.
    /// Checks if the CALLER has a role with CAN_FREEZE.
    pub fn gate_can_freeze(ctx: Context<GateCanFreeze>) -> Result<()> {
        instructions::gate_can_freeze::handler(ctx)
    }

    /// Initialize extra account metas PDAs for Token ACL resolution.
    pub fn initialize_extra_metas(ctx: Context<InitializeExtraMetas>) -> Result<()> {
        instructions::initialize_extra_metas::handler(ctx)
    }
}
