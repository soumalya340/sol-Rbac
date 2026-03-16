use crate::errors::RbacError;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct AssignRole<'info> {
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

    /// CHECK: any pubkey can be assigned a role
    pub wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + RoleAssignment::INIT_SPACE,
        seeds = [
            ROLE_ASSIGNMENT_SEED,
            organization.key().as_ref(),
            role.key().as_ref(),
            wallet.key().as_ref(),
        ],
        bump,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AssignRole>) -> Result<()> {
    let assignment = &mut ctx.accounts.role_assignment;
    assignment.organization = ctx.accounts.organization.key();
    assignment.role = ctx.accounts.role.key();
    assignment.wallet = ctx.accounts.wallet.key();
    assignment.assigned_at = Clock::get()?.unix_timestamp;
    assignment.assigned_by = ctx.accounts.authority.key();
    assignment.bump = ctx.bumps.role_assignment;

    let role = &mut ctx.accounts.role;
    role.assignment_count = role.assignment_count.checked_add(1).unwrap();

    msg!(
        "Role '{}' assigned to wallet {}",
        role.name,
        ctx.accounts.wallet.key()
    );
    Ok(())
}
