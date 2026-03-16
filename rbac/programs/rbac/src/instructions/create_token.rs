use anchor_lang::prelude::*;
use anchor_spl::token_2022;
use anchor_spl::token_interface::TokenInterface;
use crate::state::*;
use crate::errors::RbacError;
use spl_token_metadata_interface::instruction as token_metadata_instruction;

#[derive(Accounts)]
#[instruction(config: CreateTokenConfig)]
pub struct CreateToken<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_STATE_SEED],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [ORG_SEED, organization.authority.as_ref(), organization.name.as_bytes()],
        bump = organization.bump,
        constraint = organization.authority == authority.key() @ RbacError::InvalidOrgAuthority,
    )]
    pub organization: Account<'info, Organization>,

    /// CHECK: We create this account manually via Token-2022 CPIs
    #[account(mut, signer)]
    pub mint: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + ManagedMint::INIT_SPACE,
        seeds = [MANAGED_MINT_SEED, organization.key().as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub managed_mint: Account<'info, ManagedMint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CreateToken>, config: CreateTokenConfig) -> Result<()> {
    if let Some(bps) = config.transfer_fee_bps {
        require!(bps <= 10_000, RbacError::InvalidTransferFeeBps);
    }
    require!(config.name.len() <= 32, RbacError::InvalidExtensionConfig);
    require!(config.symbol.len() <= 10, RbacError::InvalidExtensionConfig);

    let decimals: u8 = match config.token_type {
        TokenType::Fungible => 9,
        TokenType::NonFungible => 0,
    };

    // ── Calculate extension space ────────────────────────────
    let mut extension_types: Vec<spl_token_2022::extension::ExtensionType> = vec![];

    extension_types.push(spl_token_2022::extension::ExtensionType::MetadataPointer);

    if config.transfer_fee_bps.is_some() {
        extension_types.push(spl_token_2022::extension::ExtensionType::TransferFeeConfig);
    }

    if config.transfer_hook_program.is_some() {
        extension_types.push(spl_token_2022::extension::ExtensionType::TransferHook);
    }

    if config.token_acl_enabled {
        extension_types.push(spl_token_2022::extension::ExtensionType::DefaultAccountState);
    }

    let mint_size = spl_token_2022::extension::ExtensionType::try_calculate_account_len::<
        spl_token_2022::state::Mint,
    >(&extension_types)
    .map_err(|_| RbacError::InvalidExtensionConfig)?;

    let metadata_space = 4 + config.name.len() + 4 + config.symbol.len() + 4 + config.uri.len() + 256;
    let total_size = mint_size + metadata_space;
    let lamports = Rent::get()?.minimum_balance(total_size);

    // ── Create the mint account ──────────────────────────────
    let create_ix = anchor_lang::solana_program::system_instruction::create_account(
        &ctx.accounts.authority.key(),
        &ctx.accounts.mint.key(),
        lamports,
        total_size as u64,
        &token_2022::ID,
    );

    anchor_lang::solana_program::program::invoke(
        &create_ix,
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // ── Initialize extensions BEFORE InitializeMint ──────────

    // 1. Metadata pointer
    let metadata_pointer_ix =
        spl_token_2022::extension::metadata_pointer::instruction::initialize(
            &token_2022::ID,
            &ctx.accounts.mint.key(),
            Some(ctx.accounts.authority.key()),
            Some(ctx.accounts.mint.key()),
        )?;
    anchor_lang::solana_program::program::invoke(
        &metadata_pointer_ix,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // 2. Transfer fee
    if let Some(bps) = config.transfer_fee_bps {
        let max_fee = config.max_transfer_fee.unwrap_or(u64::MAX);
        let transfer_fee_ix =
            spl_token_2022::extension::transfer_fee::instruction::initialize_transfer_fee_config(
                &token_2022::ID,
                &ctx.accounts.mint.key(),
                Some(&ctx.accounts.authority.key()),
                Some(&ctx.accounts.authority.key()),
                bps,
                max_fee,
            )?;
        anchor_lang::solana_program::program::invoke(
            &transfer_fee_ix,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // 3. Transfer hook
    if let Some(hook_program) = config.transfer_hook_program {
        let transfer_hook_ix =
            spl_token_2022::extension::transfer_hook::instruction::initialize(
                &token_2022::ID,
                &ctx.accounts.mint.key(),
                Some(ctx.accounts.authority.key()),
                Some(hook_program),
            )?;
        anchor_lang::solana_program::program::invoke(
            &transfer_hook_ix,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // 4. Default Account State = Frozen (for Token ACL)
    if config.token_acl_enabled {
        let default_state_ix =
            spl_token_2022::extension::default_account_state::instruction::initialize_default_account_state(
                &token_2022::ID,
                &ctx.accounts.mint.key(),
                &spl_token_2022::state::AccountState::Frozen,
            )?;
        anchor_lang::solana_program::program::invoke(
            &default_state_ix,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // ── Initialize the mint ──────────────────────────────────
    let init_mint_ix = spl_token_2022::instruction::initialize_mint2(
        &token_2022::ID,
        &ctx.accounts.mint.key(),
        &ctx.accounts.authority.key(),
        Some(&ctx.accounts.authority.key()),
        decimals,
    )?;
    anchor_lang::solana_program::program::invoke(
        &init_mint_ix,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // ── Initialize token metadata ────────────────────────────
    let init_metadata_ix = token_metadata_instruction::initialize(
        &token_2022::ID,
        &ctx.accounts.mint.key(),
        &ctx.accounts.authority.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.authority.key(),
        config.name.clone(),
        config.symbol.clone(),
        config.uri.clone(),
    );
    anchor_lang::solana_program::program::invoke(
        &init_metadata_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.to_account_info(),
        ],
    )?;

    // ── Store managed mint config ────────────────────────────
    let managed = &mut ctx.accounts.managed_mint;
    managed.organization = ctx.accounts.organization.key();
    managed.mint = ctx.accounts.mint.key();
    managed.token_type = match config.token_type {
        TokenType::Fungible => 0,
        TokenType::NonFungible => 1,
    };
    managed.has_transfer_fee = config.transfer_fee_bps.is_some();
    managed.has_transfer_hook = config.transfer_hook_program.is_some();
    managed.has_memo_required = config.memo_required;
    managed.has_token_acl = config.token_acl_enabled;
    managed.transfer_fee_bps = config.transfer_fee_bps.unwrap_or(0);
    managed.max_transfer_fee = config.max_transfer_fee.unwrap_or(0);
    managed.transfer_hook_program = config.transfer_hook_program.unwrap_or_default();
    managed.bump = ctx.bumps.managed_mint;

    let org = &mut ctx.accounts.organization;
    org.mint_count = org.mint_count.checked_add(1).unwrap();

    let global = &mut ctx.accounts.global_state;
    global.total_mints = global.total_mints.checked_add(1).unwrap();

    msg!(
        "Token '{}' ({}) created. fee={}, hook={}, memo={}, acl={}",
        config.name,
        config.symbol,
        managed.has_transfer_fee,
        managed.has_transfer_hook,
        managed.has_memo_required,
        managed.has_token_acl,
    );

    Ok(())
}