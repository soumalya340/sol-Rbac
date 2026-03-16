use crate::errors::RbacError;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateOrg<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_STATE_SEED],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        init,
        payer = authority,
        space = 8 + Organization::INIT_SPACE,
        seeds = [ORG_SEED, authority.key().as_ref(), name.as_bytes()],
        bump,
    )]
    pub organization: Account<'info, Organization>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateOrg>, name: String) -> Result<()> {
    require!(name.len() <= 32, RbacError::OrgNameTooLong);

    let org = &mut ctx.accounts.organization;
    org.authority = ctx.accounts.authority.key();
    org.name = name.clone();
    org.role_count = 0;
    org.mint_count = 0;
    org.bump = ctx.bumps.organization;

    let global = &mut ctx.accounts.global_state;
    global.total_orgs = global.total_orgs.checked_add(1).unwrap();

    msg!("Organization '{}' created", name);
    Ok(())
}
