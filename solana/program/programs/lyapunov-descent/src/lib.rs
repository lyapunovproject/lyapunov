// SPDX-License-Identifier: MIT
//
//   LYAPUNOV — descent (Solana)
//
//   The on-chain record of the system's fall to equilibrium. A companion to the
//   pump.fun-minted $LPNV token, this program carries the *meaning*: one
//   irreversible `stage` (0..=6), the depth of the descent down the funnel.
//
//       PERTURBATION → TRANSIENT → CONTRACTION → DISSIPATION
//                    → EQUILIBRIUM → ASYMPTOTIC → ATTRACTOR
//
//   Anyone may `feed` SOL into it; the cumulative amount fed drives the stage
//   forward through fixed, ascending thresholds. The stage NEVER regresses — a
//   Lyapunov function only decreases, and so does V. The fed SOL is the keepalive
//   vault, claimable only by `host` to the hardcoded `recipient`; claiming never
//   touches the stage (V cannot rise). Deploy `--final` on mainnet: immutability
//   is not a promise — it is a property.
//
//   Written zero-dependency to minimize binary size, hence deploy rent.
//   The account byte layout + PDA seed are IDENTICAL to the Anchor version, so the
//   site/server decode is unchanged: thresholds@72, stage@120, fed@121, vault@129,
//   feeders@137 (an 8-byte prefix stands in for Anchor's discriminator).
#![allow(unexpected_cfgs)]

/// Stages 0..=6. Stage 0 is genesis; six thresholds gate stages 1..6; stage 6 is
/// terminal and uncapped.
pub const STAGE_MAX: u8 = 6;
pub const THRESHOLD_COUNT: usize = 6;

/// Lyapunov-function scale: V == V_SCALE at genesis, falling to 0 as fed → ∞.
pub const V_SCALE: u128 = 1_000_000_000;

// ── account byte layout (total 162 bytes) ────────────────────────────────────
// [0]   disc/init flag (1 = initialized); [1..8] reserved  (8-byte prefix)
// [8]   host (32) ; [40] recipient (32) ; [72] thresholds (6×8=48)
// [120] stage (1) ; [121] fed (8) ; [129] vault (8) ; [137] feeders (8)
// [145] born_at (8 i64) ; [153] last_advance_at (8 i64) ; [161] bump (1)
const O_DISC: usize = 0;
const O_HOST: usize = 8;
const O_RECIPIENT: usize = 40;
const O_THRESHOLDS: usize = 72;
const O_STAGE: usize = 120;
const O_FED: usize = 121;
const O_VAULT: usize = 129;
const O_FEEDERS: usize = 137;
const O_BORN: usize = 145;
const O_LASTADV: usize = 153;
const O_BUMP: usize = 161;
const ACCOUNT_LEN: usize = 162;

const SEED: &[u8] = b"descent";

/// The stage reached at a given cumulative `fed`, against ascending thresholds.
/// Monotone and capped at `STAGE_MAX` — the descent only ever deepens.
pub fn stage_for(thresholds: &[u64; THRESHOLD_COUNT], fed: u64) -> u8 {
    let mut s: u8 = 0;
    while (s as usize) < THRESHOLD_COUNT && fed >= thresholds[s as usize] {
        s += 1;
    }
    s
}

/// A Lyapunov function: `V = t5 / (t5 + fed)`, scaled to `V_SCALE`. Equals
/// `V_SCALE` at genesis and decreases strictly toward 0. Reported off-chain;
/// never used in stage logic. `t5` is the final threshold.
pub fn v_scaled(t5: u64, fed: u64) -> u64 {
    let t5 = t5 as u128;
    let fed = fed as u128;
    ((t5 * V_SCALE) / (t5 + fed)) as u64
}

#[inline]
fn rd_u64(d: &[u8], o: usize) -> u64 {
    u64::from_le_bytes(d[o..o + 8].try_into().unwrap())
}
#[inline]
fn wr_u64(d: &mut [u8], o: usize, v: u64) {
    d[o..o + 8].copy_from_slice(&v.to_le_bytes());
}
#[inline]
fn read_thresholds(d: &[u8]) -> [u64; THRESHOLD_COUNT] {
    let mut t = [0u64; THRESHOLD_COUNT];
    let mut i = 0;
    while i < THRESHOLD_COUNT {
        t[i] = rd_u64(d, O_THRESHOLDS + i * 8);
        i += 1;
    }
    t
}

// ── on-chain runtime (SBF target only; keeps host `cargo test` free of the runtime crate) ──
#[cfg(target_os = "solana")]
mod runtime {
    use super::*;
    use pinocchio::{
        account_info::AccountInfo,
        cpi::{invoke, invoke_signed},
        instruction::{AccountMeta, Instruction, Seed, Signer},
        program_error::ProgramError,
        pubkey::{create_program_address, find_program_address, Pubkey},
        sysvars::{clock::Clock, rent::Rent, Sysvar},
        ProgramResult,
    };

    const SYSTEM_ID: Pubkey = [0u8; 32];

    pinocchio::entrypoint!(process_instruction);

    pub fn process_instruction(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        data: &[u8],
    ) -> ProgramResult {
        let (tag, rest) = data
            .split_first()
            .ok_or(ProgramError::InvalidInstructionData)?;
        match *tag {
            0 => initialize(program_id, accounts, rest),
            1 => feed(program_id, accounts, rest),
            2 => claim(program_id, accounts, rest),
            _ => Err(ProgramError::InvalidInstructionData),
        }
    }

    /// data = host(32) ‖ recipient(32) ‖ thresholds(6×8). Accounts:
    /// [payer (signer, writable), descent PDA (writable), system_program].
    fn initialize(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
        let [payer, descent, system_program, ..] = accounts else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };
        if !payer.is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }
        if system_program.key() != &SYSTEM_ID {
            return Err(ProgramError::IncorrectProgramId);
        }
        if descent.data_len() != 0 || !descent.is_owned_by(&SYSTEM_ID) {
            return Err(ProgramError::AccountAlreadyInitialized);
        }
        if data.len() != 32 + 32 + THRESHOLD_COUNT * 8 {
            return Err(ProgramError::InvalidInstructionData);
        }

        // thresholds: strictly ascending, non-zero.
        let mut th = [0u64; THRESHOLD_COUNT];
        let mut i = 0;
        while i < THRESHOLD_COUNT {
            th[i] = u64::from_le_bytes(
                data[64 + i * 8..64 + i * 8 + 8]
                    .try_into()
                    .map_err(|_| ProgramError::InvalidInstructionData)?,
            );
            i += 1;
        }
        if th[0] == 0 {
            return Err(ProgramError::InvalidInstructionData);
        }
        let mut j = 1;
        while j < THRESHOLD_COUNT {
            if th[j] <= th[j - 1] {
                return Err(ProgramError::InvalidInstructionData);
            }
            j += 1;
        }

        // canonical PDA
        let (expected, bump) = find_program_address(&[SEED], program_id);
        if descent.key() != &expected {
            return Err(ProgramError::InvalidSeeds);
        }

        // create the account via System CPI, signed by the PDA.
        let lamports = Rent::get()?.minimum_balance(ACCOUNT_LEN);
        let mut ca = [0u8; 52]; // [0u32 create] ‖ lamports(8) ‖ space(8) ‖ owner(32)
        ca[4..12].copy_from_slice(&lamports.to_le_bytes());
        ca[12..20].copy_from_slice(&(ACCOUNT_LEN as u64).to_le_bytes());
        ca[20..52].copy_from_slice(program_id);
        let metas = [
            AccountMeta::new(payer.key(), true, true),
            AccountMeta::new(descent.key(), true, true),
        ];
        let ix = Instruction {
            program_id: &SYSTEM_ID,
            accounts: &metas,
            data: &ca,
        };
        let bump_arr = [bump];
        let seeds = [Seed::from(SEED), Seed::from(&bump_arr[..])];
        let signer = Signer::from(&seeds[..]);
        invoke_signed(&ix, &[payer, descent], &[signer])?;

        // write genesis state.
        let now = Clock::get()?.unix_timestamp;
        let mut data_ref = descent.try_borrow_mut_data()?;
        let d: &mut [u8] = &mut data_ref;
        d[O_DISC] = 1;
        d[O_HOST..O_HOST + 32].copy_from_slice(&data[0..32]);
        d[O_RECIPIENT..O_RECIPIENT + 32].copy_from_slice(&data[32..64]);
        let mut k = 0;
        while k < THRESHOLD_COUNT {
            wr_u64(d, O_THRESHOLDS + k * 8, th[k]);
            k += 1;
        }
        d[O_STAGE] = 0;
        wr_u64(d, O_FED, 0);
        wr_u64(d, O_VAULT, 0);
        wr_u64(d, O_FEEDERS, 0);
        d[O_BORN..O_BORN + 8].copy_from_slice(&now.to_le_bytes());
        d[O_LASTADV..O_LASTADV + 8].copy_from_slice(&now.to_le_bytes());
        d[O_BUMP] = bump;
        Ok(())
    }

    /// data = amount(8). Accounts: [feeder (signer, writable), descent (writable),
    /// system_program]. Permissionless.
    fn feed(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
        let [feeder, descent, system_program, ..] = accounts else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };
        if !feeder.is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }
        if system_program.key() != &SYSTEM_ID {
            return Err(ProgramError::IncorrectProgramId);
        }
        if !descent.is_owned_by(program_id) {
            return Err(ProgramError::IllegalOwner);
        }
        if data.len() != 8 {
            return Err(ProgramError::InvalidInstructionData);
        }
        let amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
        if amount == 0 {
            return Err(ProgramError::InvalidInstructionData);
        }
        verify_pda(descent, program_id)?;

        // transfer feeder → descent (System CPI; feeder signed the tx).
        let mut td = [0u8; 12]; // [2u32 transfer] ‖ lamports(8)
        td[0..4].copy_from_slice(&2u32.to_le_bytes());
        td[4..12].copy_from_slice(&amount.to_le_bytes());
        let metas = [
            AccountMeta::new(feeder.key(), true, true),
            AccountMeta::new(descent.key(), true, false),
        ];
        let ix = Instruction {
            program_id: &SYSTEM_ID,
            accounts: &metas,
            data: &td,
        };
        invoke(&ix, &[feeder, descent])?;

        // update the descent.
        let now = Clock::get()?.unix_timestamp;
        let mut data_ref = descent.try_borrow_mut_data()?;
        let d: &mut [u8] = &mut data_ref;
        let fed = rd_u64(d, O_FED)
            .checked_add(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let vault = rd_u64(d, O_VAULT)
            .checked_add(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let feeders = rd_u64(d, O_FEEDERS).wrapping_add(1);
        wr_u64(d, O_FED, fed);
        wr_u64(d, O_VAULT, vault);
        wr_u64(d, O_FEEDERS, feeders);
        let th = read_thresholds(d);
        let prev = d[O_STAGE];
        let next = stage_for(&th, fed);
        if next > prev {
            d[O_STAGE] = next;
            d[O_LASTADV..O_LASTADV + 8].copy_from_slice(&now.to_le_bytes());
        }
        Ok(())
    }

    /// data = amount(8). Accounts: [host (signer), descent (writable), recipient
    /// (writable)]. Host-only; vault → recipient; stage untouched.
    fn claim(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
        let [host, descent, recipient, ..] = accounts else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };
        if !host.is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }
        if !descent.is_owned_by(program_id) {
            return Err(ProgramError::IllegalOwner);
        }
        if data.len() != 8 {
            return Err(ProgramError::InvalidInstructionData);
        }
        let amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
        if amount == 0 {
            return Err(ProgramError::InvalidInstructionData);
        }
        verify_pda(descent, program_id)?;

        let vault = {
            let data_ref = descent.try_borrow_data()?;
            let d: &[u8] = &data_ref;
            // has_one host + recipient
            if d[O_HOST..O_HOST + 32] != host.key()[..] {
                return Err(ProgramError::InvalidAccountData);
            }
            if d[O_RECIPIENT..O_RECIPIENT + 32] != recipient.key()[..] {
                return Err(ProgramError::InvalidAccountData);
            }
            rd_u64(d, O_VAULT)
        };
        if amount > vault {
            return Err(ProgramError::InsufficientFunds);
        }

        // move lamports: debit descent (program-owned), credit recipient.
        {
            let mut dl = descent.try_borrow_mut_lamports()?;
            let mut rl = recipient.try_borrow_mut_lamports()?;
            *dl = dl
                .checked_sub(amount)
                .ok_or(ProgramError::InsufficientFunds)?;
            *rl = rl
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }
        // decrement the vault accounting; stage is untouched.
        let mut data_ref = descent.try_borrow_mut_data()?;
        let d: &mut [u8] = &mut data_ref;
        wr_u64(d, O_VAULT, vault - amount);
        Ok(())
    }

    /// Re-derive the PDA from the stored bump and verify it matches, and that the
    /// account is an initialized descent of the right length.
    fn verify_pda(descent: &AccountInfo, program_id: &Pubkey) -> ProgramResult {
        let data_ref = descent.try_borrow_data()?;
        let d: &[u8] = &data_ref;
        if d.len() != ACCOUNT_LEN || d[O_DISC] != 1 {
            return Err(ProgramError::UninitializedAccount);
        }
        let bump_arr = [d[O_BUMP]];
        let expected = create_program_address(&[SEED, &bump_arr], program_id)
            .map_err(|_| ProgramError::InvalidSeeds)?;
        if descent.key() != &expected {
            return Err(ProgramError::InvalidSeeds);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const E: u64 = 1_000_000_000; // 1 SOL in lamports

    fn th() -> [u64; THRESHOLD_COUNT] {
        [E / 2, 3 * E / 2, 3 * E, 6 * E, 12 * E, 25 * E]
    }

    #[test]
    fn starts_at_zero() {
        assert_eq!(stage_for(&th(), 0), 0);
        assert_eq!(stage_for(&th(), E / 2 - 1), 0);
    }

    #[test]
    fn advances_on_thresholds() {
        assert_eq!(stage_for(&th(), E / 2), 1);
        assert_eq!(stage_for(&th(), 3 * E / 2), 2);
        assert_eq!(stage_for(&th(), 3 * E), 3);
        assert_eq!(stage_for(&th(), 6 * E), 4);
        assert_eq!(stage_for(&th(), 12 * E), 5);
        assert_eq!(stage_for(&th(), 25 * E), 6);
    }

    #[test]
    fn caps_and_is_monotonic() {
        assert_eq!(stage_for(&th(), 1000 * E), STAGE_MAX);
        let mut last = 0u8;
        for f in 0..=30u64 {
            let s = stage_for(&th(), f * E);
            assert!(s >= last, "stage regressed");
            last = s;
        }
        assert_eq!(last, STAGE_MAX);
    }

    #[test]
    fn v_starts_at_one_and_decreases() {
        let t = th();
        let t5 = t[THRESHOLD_COUNT - 1];
        assert_eq!(v_scaled(t5, 0), V_SCALE as u64);
        let v0 = v_scaled(t5, 0);
        let v1 = v_scaled(t5, t5);
        assert!(v1 < v0);
        assert_eq!(v1, (V_SCALE / 2) as u64);
        let mut last = v0;
        for f in 1..=30u64 {
            let v = v_scaled(t5, f * E);
            assert!(v <= last, "V rose");
            last = v;
        }
    }

    #[test]
    fn layout_offsets_match_anchor() {
        // server.js + read scripts decode at these fixed offsets — must not drift.
        assert_eq!(O_THRESHOLDS, 72);
        assert_eq!(O_STAGE, 120);
        assert_eq!(O_FED, 121);
        assert_eq!(O_VAULT, 129);
        assert_eq!(O_FEEDERS, 137);
        assert_eq!(ACCOUNT_LEN, 162);
    }
}
