import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { AccountsModule } from '../accounts/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../auth/users/index.js';

import { BeneficiariesController } from './beneficiaries.controller.js';
import { BENEFICIARY_MODEL } from './beneficiary.constants.js';
import { BeneficiaryRepository } from './beneficiary.repository.js';
import { BeneficiarySchema } from './beneficiary.schema.js';
import { BeneficiaryService } from './beneficiary.service.js';
import { BeneficiaryStore } from './beneficiary.store.js';
import { PayeeResolverService } from './payee-resolver.service.js';
import { PayeeTrustService } from './payee-trust.service.js';
import { PayeeDirectoryPort } from './ports/payee-directory.port.js';
import { PayeeNamePort } from './ports/payee-name.port.js';
import { ResolverPayeeNameAdapter } from './ports/resolver-payee-name.adapter.js';
import { UserPayeeDirectoryAdapter } from './ports/user-payee-directory.adapter.js';

/**
 * Saved payees, payee resolution and the cooling-off rule.
 *
 * This module sits *below* transfers in the graph and the dependency must stay that way.
 * "Who is this payee, and may they be paid this much?" is a question about the address
 * book, and it has to be answerable by anything that moves money — transfers today, bill
 * pay and standing orders next — without each of them importing the others.
 *
 * `PayeeResolverService` is the single destination → account lookup in the system. It is
 * exported rather than duplicated because three callers need it and three copies would
 * eventually disagree about which account an email belongs to.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: BENEFICIARY_MODEL, schema: BeneficiarySchema }]),
    AccountsModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [BeneficiariesController],
  providers: [
    { provide: BeneficiaryStore, useClass: BeneficiaryRepository },
    { provide: PayeeDirectoryPort, useClass: UserPayeeDirectoryAdapter },
    { provide: PayeeNamePort, useClass: ResolverPayeeNameAdapter },
    PayeeResolverService,
    BeneficiaryService,
    PayeeTrustService,
    // Provided locally, as the ledger and accounts lanes do, so the module stands up in a
    // test that wires only a Mongoose connection rather than the whole application root.
    IdGenerator,
  ],
  exports: [
    BeneficiaryStore,
    BeneficiaryService,
    PayeeTrustService,
    PayeeResolverService,
    PayeeDirectoryPort,
    PayeeNamePort,
  ],
})
export class BeneficiariesModule {}
