use crate::errors::RbacError;
use crate::state::*;
use anchor_lang::prelude::*;

/// sRFC37: CanFreezePermissionless
///
/// Token ACL calls this when someone tries to permissionlessly freeze
/// a token account. We check if the CALLER has CAN_FREEZE permission.

#[derive(Accounts)]
pub struct GateCanFreeze<'info> {
    /// CHECK: validated by Token ACL as the caller authority account.
    pub authority: AccountInfo<'info>,

    /// CHECK: validated by Token ACL
    pub token_account: AccountInfo<'info>,

    /// CHECK: validated by Token ACL
    pub mint: AccountInfo<'info>,

    /// CHECK: validated by Token ACL
    pub token_account_owner: AccountInfo<'info>,

    /// CHECK: reentrancy guard
    pub flag_account: AccountInfo<'info>,

    /// CHECK: extra metas PDA
    pub extra_metas: AccountInfo<'info>,

    // ── RBAC extra accounts (check CALLER not owner) ──
    #[account(
        constraint = organization.key() == role.organization @ RbacError::Unauthorized,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        constraint = role.organization == organization.key() @ RbacError::Unauthorized,
        constraint = role.has_permission(PERM_CAN_FREEZE) @ RbacError::FreezeNotPermitted,
    )]
    pub role: Account<'info, Role>,

    #[account(
        seeds = [
            ROLE_ASSIGNMENT_SEED,
            organization.key().as_ref(),
            role.key().as_ref(),
            authority.key().as_ref(),
        ],
        bump = role_assignment.bump,
        constraint = role_assignment.wallet == authority.key() @ RbacError::FreezeNotPermitted,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
}

pub fn handler(ctx: Context<GateCanFreeze>) -> Result<()> {
    let flag_data = ctx.accounts.flag_account.try_borrow_data()?;
    require!(
        flag_data.len() == 1 && flag_data[0] == 1,
        RbacError::FlagAccountNotSet
    );
    drop(flag_data);

    msg!(
        "RBAC Gate: FREEZE APPROVED by caller {} (role: '{}', freezing account owned by {})",
        ctx.accounts.authority.key(),
        ctx.accounts.role.name,
        ctx.accounts.token_account_owner.key(),
    );

    Ok(())
}
