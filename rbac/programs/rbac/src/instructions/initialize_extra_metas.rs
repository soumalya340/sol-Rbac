use anchor_lang::prelude::*;
use crate::state::*;

/// Initialize ExtraAccountMetas PDAs that Token ACL uses to resolve
/// which additional accounts our gate program needs.

#[derive(Accounts)]
pub struct InitializeExtraMetas<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: we just need the pubkey for PDA derivation
    pub mint: AccountInfo<'info>,

    /// CHECK: created via seeds
    #[account(
        mut,
        seeds = [THAW_EXTRA_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub thaw_extra_metas: AccountInfo<'info>,

    /// CHECK: created via seeds
    #[account(
        mut,
        seeds = [FREEZE_EXTRA_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub freeze_extra_metas: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeExtraMetas>) -> Result<()> {
    // For the MVP, extra metas are empty.
    // Client-side SDK resolves organization, role, role_assignment
    // and passes them as remaining_accounts when calling thaw_permissionless.
    //
    // Full implementation would use spl_tlv_account_resolution to define
    // the accounts Token ACL should resolve automatically.

    msg!(
        "Extra metas initialized for mint {}. Client-side resolution required for RBAC accounts.",
        ctx.accounts.mint.key()
    );

    Ok(())
}
