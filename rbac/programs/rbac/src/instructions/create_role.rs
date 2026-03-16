use crate::errors::RbacError;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(role_name: String, _permissions: u16)]
pub struct CreateRole<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ORG_SEED, organization.authority.as_ref(), organization.name.as_bytes()],
        bump = organization.bump,
        constraint = organization.authority == authority.key() @ RbacError::InvalidOrgAuthority,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        init,
        payer = authority,
        space = 8 + Role::INIT_SPACE,
        seeds = [ROLE_SEED, organization.key().as_ref(), role_name.as_bytes()],
        bump,
    )]
    pub role: Account<'info, Role>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateRole>, role_name: String, permissions: u16) -> Result<()> {
    require!(role_name.len() <= 32, RbacError::RoleNameTooLong);
    require!(permissions > 0, RbacError::InvalidPermissions);

    let role = &mut ctx.accounts.role;
    role.organization = ctx.accounts.organization.key();
    role.name = role_name.clone();
    role.permissions = permissions;
    role.assignment_count = 0;
    role.bump = ctx.bumps.role;

    let org = &mut ctx.accounts.organization;
    org.role_count = org.role_count.checked_add(1).unwrap();

    msg!(
        "Role '{}' created with permissions: {:#06b}",
        role_name,
        permissions
    );
    Ok(())
}
