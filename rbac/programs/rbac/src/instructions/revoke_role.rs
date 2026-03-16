use crate::errors::RbacError;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct RevokeRole<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [ORG_SEED, organization.authority.as_ref(), organization.name.as_bytes()],
        bump = organization.bump,
        constraint = organization.authority == authority.key() @ RbacError::InvalidOrgAuthority,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        mut,
        seeds = [ROLE_SEED, organization.key().as_ref(), role.name.as_bytes()],
        bump = role.bump,
        constraint = role.organization == organization.key() @ RbacError::Unauthorized,
    )]
    pub role: Account<'info, Role>,

    /// CHECK: validated by role_assignment PDA seeds
    pub wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        close = authority,
        seeds = [
            ROLE_ASSIGNMENT_SEED,
            organization.key().as_ref(),
            role.key().as_ref(),
            wallet.key().as_ref(),
        ],
        bump = role_assignment.bump,
        constraint = role_assignment.wallet == wallet.key() @ RbacError::RoleNotAssigned,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RevokeRole>) -> Result<()> {
    let role = &mut ctx.accounts.role;
    role.assignment_count = role.assignment_count.checked_sub(1).unwrap();

    msg!(
        "Role '{}' revoked from wallet {}",
        role.name,
        ctx.accounts.wallet.key()
    );
    Ok(())
}
