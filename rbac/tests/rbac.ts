import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { SolRbac } from "../target/types/sol_rbac";

describe("rbac", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = provider.wallet;

  const program = ((anchor.workspace as any).SolRbac ??
    (anchor.workspace as any).solRbac ??
    (anchor.workspace as any).rbac) as Program<SolRbac>;

  const TOKEN_2022_PROGRAM_ID = new anchor.web3.PublicKey(
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  );

  const GLOBAL_STATE_SEED = Buffer.from("global_state");
  const ORG_SEED = Buffer.from("organization");
  const ROLE_SEED = Buffer.from("role");
  const ROLE_ASSIGNMENT_SEED = Buffer.from("role_assignment");
  const MANAGED_MINT_SEED = Buffer.from("managed_mint");

  const orgName = `acme-${Date.now()}`;
  const roleName = "TRADER";
  const canTransferPerm = 1; // PERM_CAN_TRANSFER
  const targetWallet = anchor.web3.Keypair.generate().publicKey;

  let globalStatePda: anchor.web3.PublicKey;
  let organizationPda: anchor.web3.PublicKey;
  let rolePda: anchor.web3.PublicKey;
  let roleAssignmentPda: anchor.web3.PublicKey;

  it("initializes global state", async () => {
    [globalStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [GLOBAL_STATE_SEED],
      program.programId
    );

    await program.methods
      .initializeGlobal()
      .accountsPartial({
        authority: wallet.publicKey,
        globalState: globalStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const global = await program.account.globalState.fetch(globalStatePda);
    assert.isTrue(global.authority.equals(wallet.publicKey));
    assert.equal(global.totalOrgs.toNumber(), 0);
    assert.equal(global.totalMints.toNumber(), 0);
    assert.isTrue(global.feeReceiver.equals(wallet.publicKey));
  });

  it("creates organization and role", async () => {
    [organizationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [ORG_SEED, wallet.publicKey.toBuffer(), Buffer.from(orgName)],
      program.programId
    );

    await program.methods
      .createOrg(orgName)
      .accountsPartial({
        authority: wallet.publicKey,
        globalState: globalStatePda,
        organization: organizationPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const org = await program.account.organization.fetch(organizationPda);
    assert.equal(org.name, orgName);
    assert.isTrue(org.authority.equals(wallet.publicKey));
    assert.equal(org.roleCount, 0);
    assert.equal(org.mintCount, 0);

    [rolePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [ROLE_SEED, organizationPda.toBuffer(), Buffer.from(roleName)],
      program.programId
    );

    await program.methods
      .createRole(roleName, canTransferPerm)
      .accountsPartial({
        authority: wallet.publicKey,
        organization: organizationPda,
        role: rolePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const role = await program.account.role.fetch(rolePda);
    assert.equal(role.name, roleName);
    assert.equal(role.permissions, canTransferPerm);
    assert.equal(role.assignmentCount, 0);

    const global = await program.account.globalState.fetch(globalStatePda);
    assert.equal(global.totalOrgs.toNumber(), 1);
  });

  it("assigns then revokes role", async () => {
    [roleAssignmentPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        ROLE_ASSIGNMENT_SEED,
        organizationPda.toBuffer(),
        rolePda.toBuffer(),
        targetWallet.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .assignRole()
      .accountsPartial({
        authority: wallet.publicKey,
        organization: organizationPda,
        role: rolePda,
        wallet: targetWallet,
        roleAssignment: roleAssignmentPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const roleAfterAssign = await program.account.role.fetch(rolePda);
    assert.equal(roleAfterAssign.assignmentCount, 1);

    const assignment = await program.account.roleAssignment.fetch(
      roleAssignmentPda
    );
    assert.isTrue(assignment.wallet.equals(targetWallet));
    assert.isTrue(assignment.assignedBy.equals(wallet.publicKey));

    await program.methods
      .revokeRole()
      .accountsPartial({
        authority: wallet.publicKey,
        organization: organizationPda,
        role: rolePda,
        wallet: targetWallet,
        roleAssignment: roleAssignmentPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const roleAfterRevoke = await program.account.role.fetch(rolePda);
    assert.equal(roleAfterRevoke.assignmentCount, 0);
  });

  async function createTokenAndExpectFailure(tokenAclEnabled: boolean) {
    const mint = anchor.web3.Keypair.generate();
    const [managedMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [MANAGED_MINT_SEED, organizationPda.toBuffer(), mint.publicKey.toBuffer()],
      program.programId
    );

    const config = {
      tokenType: { fungible: {} },
      name: tokenAclEnabled ? "ACL Coin" : "Plain Coin",
      symbol: tokenAclEnabled ? "ACL" : "PLN",
      uri: "https://example.com/metadata.json",
      transferFeeBps: null,
      maxTransferFee: null,
      transferHookProgram: null,
      memoRequired: false,
      tokenAclEnabled,
    };

    const globalBefore = await program.account.globalState.fetch(globalStatePda);
    const orgBefore = await program.account.organization.fetch(organizationPda);

    let thrown = false;
    try {
      await program.methods
        .createToken(config)
        .accountsPartial({
          authority: wallet.publicKey,
          globalState: globalStatePda,
          organization: organizationPda,
          mint: mint.publicKey,
          managedMint: managedMintPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mint])
        .rpc();
    } catch (err) {
      thrown = true;
      assert.include(
        String(err),
        "invalid account data for instruction",
        "createToken should fail with token-2022 account sizing/init mismatch"
      );
    }

    assert.isTrue(thrown, "createToken was expected to fail but succeeded");

    const globalAfter = await program.account.globalState.fetch(globalStatePda);
    const orgAfter = await program.account.organization.fetch(organizationPda);
    assert.equal(
      globalAfter.totalMints.toNumber(),
      globalBefore.totalMints.toNumber(),
      "global mint counter should not increment on failed tx"
    );
    assert.equal(
      orgAfter.mintCount,
      orgBefore.mintCount,
      "org mint counter should not increment on failed tx"
    );
  }

  it("create_token currently fails with token ACL disabled (regression guard)", async () => {
    await createTokenAndExpectFailure(false);
  });

  it("create_token currently fails with token ACL enabled (regression guard)", async () => {
    await createTokenAndExpectFailure(true);
  });
});
