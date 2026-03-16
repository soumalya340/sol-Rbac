use crate::errors::RbacError;
use crate::state::*;
use anchor_lang::prelude::*;

/// sRFC37: CanThawPermissionless
///
/// Token ACL calls this when a user tries to permissionlessly thaw.
/// We check if token_account_owner has a role with CAN_TRANSFER.
///
/// Fixed accounts [0..5] per sRFC37:
///   [0] authority, [1] token_account, [2] mint,
///   [3] token_account_owner, [4] flag_account, [5] extra_metas
/// Extra accounts [6+]: organization, role, role_assignment

#[derive(Accounts)]
pub struct GateCanThaw<'info> {
    /// CHECK: validated by Token ACL as the caller authority account.
    pub authority: AccountInfo<'info>,

    /// CHECK: validated by Token ACL
    pub token_account: AccountInfo<'info>,

    /// CHECK: validated by Token ACL
    pub mint: AccountInfo<'info>,

    /// CHECK: validated by Token ACL
    pub token_account_owner: AccountInfo<'info>,

    /// CHECK: reentrancy guard from Token ACL
    pub flag_account: AccountInfo<'info>,

    /// CHECK: extra metas PDA
    pub extra_metas: AccountInfo<'info>,

    // ── RBAC extra accounts ──
    #[account(
        constraint = organization.key() == role.organization @ RbacError::Unauthorized,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        constraint = role.organization == organization.key() @ RbacError::Unauthorized,
        constraint = role.has_permission(PERM_CAN_TRANSFER) @ RbacError::ThawNotPermitted,
    )]
    pub role: Account<'info, Role>,

    #[account(
        seeds = [
            ROLE_ASSIGNMENT_SEED,
            organization.key().as_ref(),
            role.key().as_ref(),
            token_account_owner.key().as_ref(),
        ],
        bump = role_assignment.bump,
        constraint = role_assignment.wallet == token_account_owner.key() @ RbacError::ThawNotPermitted,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
}

pub fn handler(ctx: Context<GateCanThaw>) -> Result<()> {
    let flag_data = ctx.accounts.flag_account.try_borrow_data()?;
    require!(
        flag_data.len() == 1 && flag_data[0] == 1,
        RbacError::FlagAccountNotSet
    );
    drop(flag_data);

    msg!(
        "RBAC Gate: THAW APPROVED for wallet {} (role: '{}', org: '{}')",
        ctx.accounts.token_account_owner.key(),
        ctx.accounts.role.name,
        ctx.accounts.organization.name,
    );

    Ok(())
}
