# Solana wallet — usage

Local Solana CLI wallet on this host. Set up 2026-05-22 via the Anza installer.

## Wallet

| Item | Value |
|---|---|
| Public address | `HauxDYg7G5wzhBR9x2TdteBxQsPJ66kqjunA5hvEQuMy` |
| Keypair file | `~/.config/solana/id.json` |
| Network | mainnet-beta |
| Seed phrase | **not stored here** — back it up off-host |

The public address receives SOL and any SPL token (USDC, USDT, etc.) — same string for everything.

## PATH

`~/.bashrc` adds the Solana bin dir to PATH, so any new bash shell has `solana`, `solana-keygen`, and `spl-token` available. If a shell ever can't find them:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

## Receiving funds

Hand `HauxDYg7G5wzhBR9x2TdteBxQsPJ66kqjunA5hvEQuMy` to the sender. Works for SOL and SPL tokens — the sender's wallet auto-creates the per-token sub-account (Associated Token Account) and pays the ~0.002 SOL rent the first time a given token is sent.

## Day-to-day commands

```bash
solana address              # show receiving address
solana balance              # SOL balance
solana transaction-count    # sanity-check RPC reachability
solana config get           # show current network + keypair path
spl-token accounts          # show USDC and other token balances
```

## Inspecting a specific incoming transfer

```bash
solana transaction-history HauxDYg7G5wzhBR9x2TdteBxQsPJ66kqjunA5hvEQuMy --limit 5
solana confirm -v <SIGNATURE>     # full detail on a specific tx
```

Or paste the address into <https://solscan.io/account/HauxDYg7G5wzhBR9x2TdteBxQsPJ66kqjunA5hvEQuMy> for a GUI view.

## Switching networks (for testing)

```bash
solana config set --url devnet            # free test SOL available
solana airdrop 1                          # devnet only
solana config set --url mainnet-beta      # back to real money
```

## Sending funds (when needed)

```bash
solana transfer <RECIPIENT_ADDRESS> <AMOUNT_SOL> --allow-unfunded-recipient
spl-token transfer <MINT> <AMOUNT> <RECIPIENT>   # for USDC etc.
```

USDC mainnet mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

## RPC note

The default `api.mainnet-beta.solana.com` is rate-limited and fine for balance checks. For heavier use, swap to a free tier from Helius / QuickNode / Triton via `solana config set --url <rpc-url>`.

## Recovery

If `~/.config/solana/id.json` is lost, restore from the 12-word seed phrase:

```bash
solana-keygen recover -o ~/.config/solana/id.json
```

This is the only path back to the funds. If both the file and the seed are gone, the wallet is gone.
