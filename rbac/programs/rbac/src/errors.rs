use anchor_lang::prelude::*;

#[error_code]
pub enum RbacError {
    #[msg("Unauthorized: caller does not have the required role")]
    Unauthorized,

    #[msg("Role already exists in this organization")]
    RoleAlreadyExists,

    #[msg("Role assignment already exists for this wallet")]
    RoleAlreadyAssigned,

    #[msg("Role not assigned to this wallet")]
    RoleNotAssigned,

    #[msg("Invalid organization authority")]
    InvalidOrgAuthority,

    #[msg("Invalid role permissions configuration")]
    InvalidPermissions,

    #[msg("Token ACL is not enabled for this mint")]
    TokenAclNotEnabled,

    #[msg("Invalid Token-2022 extension configuration")]
    InvalidExtensionConfig,

    #[msg("Transfer fee basis points must be <= 10000")]
    InvalidTransferFeeBps,

    #[msg("Max roles per organization exceeded")]
    MaxRolesExceeded,

    #[msg("Max role assignments exceeded")]
    MaxAssignmentsExceeded,

    #[msg("Organization name too long (max 32 bytes)")]
    OrgNameTooLong,

    #[msg("Role name too long (max 32 bytes)")]
    RoleNameTooLong,

    #[msg("Invalid flag account - not owned by Token ACL")]
    InvalidFlagAccount,

    #[msg("Flag account not set - reentrancy guard missing")]
    FlagAccountNotSet,

    #[msg("Wallet is on the block list and cannot be thawed")]
    WalletBlocked,

    #[msg("Wallet does not have a role that permits thawing")]
    ThawNotPermitted,

    #[msg("Wallet does not have a role that permits freezing")]
    FreezeNotPermitted,
}
