use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeGlobal<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + GlobalState::INIT_SPACE,
        seeds = [GLOBAL_STATE_SEED],
        bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeGlobal>) -> Result<()> {
    let global = &mut ctx.accounts.global_state;
    global.authority = ctx.accounts.authority.key();
    global.total_orgs = 0;
    global.total_mints = 0;
    global.fee_receiver = ctx.accounts.authority.key();
    global.bump = ctx.bumps.global_state;

    msg!("Global state initialized. Authority: {}", global.authority);
    Ok(())
}
