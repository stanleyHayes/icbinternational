import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../auth/users/index.js';
import { FxModule } from '../fx/index.js';

import { WalletConversionService } from './wallet-conversion.service.js';
import { WalletService } from './wallet.service.js';

/**
 * Multi-currency holdings.
 *
 * A thin module by design. A wallet is not a new kind of object — it is an account in a
 * currency — so this lane adds no collection and no schema of its own. What it adds is the
 * two questions an account cannot answer alone: what is all of this worth together, and how
 * does value get from one of these to another.
 *
 * It has no controller. `GET /accounts/net-worth` is served by the accounts lane and every
 * conversion route belongs to FX, so exposing a parallel `/wallets` surface would mean
 * inventing paths the frozen contract does not carry and giving the client two ways to ask
 * the same question. `WalletService` is exported instead, and the accounts lane can adopt
 * it — see `docs/HANDOFFS.md`.
 */
@Module({
  imports: [AuthModule, AccountsModule, UsersModule, FxModule],
  providers: [WalletService, WalletConversionService],
  exports: [WalletService, WalletConversionService],
})
export class WalletsModule {}
