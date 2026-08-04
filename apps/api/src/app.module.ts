import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { ClockModule } from './common/clock/clock.module.js';
import { AppExceptionFilter } from './common/errors/exception.filter.js';
import { IdGenerator } from './common/ids/id-generator.js';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response.interceptor.js';
import { TraceMiddleware } from './common/middleware/trace.middleware.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BeneficiariesModule } from './modules/beneficiaries/beneficiaries.module.js';
import { BillPayModule } from './modules/bill-pay/bill-pay.module.js';
import { CardsModule } from './modules/cards/cards.module.js';
import { CmsModule } from './modules/cms/cms.module.js';
import { DepositsModule } from './modules/deposits/deposits.module.js';
import { DevicesModule } from './modules/devices/devices.module.js';
import { FeesModule } from './modules/fees/fees.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { FxModule } from './modules/fx/fx.module.js';
import { GlModule } from './modules/gl/gl.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { HoldsModule } from './modules/holds/holds.module.js';
import { IdempotencyModule } from './modules/idempotency/idempotency.module.js';
import { InsightsModule } from './modules/insights/insights.module.js';
import { InterestModule } from './modules/interest/interest.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { KycModule } from './modules/kyc/kyc.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { LimitsModule } from './modules/limits/limits.module.js';
import { LoansModule } from './modules/loans/loans.module.js';
import { MandatesModule } from './modules/mandates/mandates.module.js';
import { MfaModule } from './modules/mfa/mfa.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OverdraftModule } from './modules/overdraft/overdraft.module.js';
import { PaymentRequestsModule } from './modules/payment-requests/payment-requests.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { PublicModule } from './modules/public/public.module.js';
import { RbacModule } from './modules/rbac/rbac.module.js';
import { SavingsGoalsModule } from './modules/savings-goals/savings-goals.module.js';
import { TransactionsModule } from './modules/transactions/transactions.module.js';
import { TransfersModule } from './modules/transfers/transfers.module.js';
import { WalletsModule } from './modules/wallets/wallets.module.js';

/**
 * The application root.
 *
 * Cross-cutting concerns are registered here once, globally, rather than being remembered
 * at each controller: every response is enveloped, every error is rendered in the contract
 * shape, and every request carries a trace id. A feature module cannot opt out by
 * forgetting a decorator.
 *
 * Feature modules are grouped in dependency order — platform, then identity, then the book,
 * then the products built on it. Nest resolves the graph whatever the order, but reading
 * this list top to bottom should tell you what the system is made of and what rests on what.
 */
@Module({
  imports: [
    // --- Platform ---------------------------------------------------------
    AppConfigModule,
    ClockModule,
    DatabaseModule,
    HealthModule,
    AuditModule,
    IdempotencyModule,
    JobsModule,

    // --- Identity ---------------------------------------------------------
    AuthModule,
    MfaModule,
    DevicesModule,
    RbacModule,

    // --- The book ---------------------------------------------------------
    // Everything below this line moves money, and every movement lands here.
    GlModule,
    LedgerModule,
    AccountsModule,
    HoldsModule,
    TransactionsModule,
    InterestModule,

    // --- Pricing and eligibility ------------------------------------------
    // Before the products, because every one of them prices through these.
    ProductsModule,
    FeesModule,
    LimitsModule,

    // --- Money movement ---------------------------------------------------
    // FxModule first: wallets converts through it.
    BeneficiariesModule,
    TransfersModule,
    FxModule,
    WalletsModule,
    BillPayModule,
    PaymentRequestsModule,
    MandatesModule,
    CardsModule,

    // --- Credit and saving ------------------------------------------------
    LoansModule,
    OverdraftModule,
    DepositsModule,
    SavingsGoalsModule,

    // --- Onboarding, engagement and content -------------------------------
    KycModule,
    FilesModule,
    InsightsModule,
    NotificationsModule,
    CmsModule,
    PublicModule,
  ],
  providers: [
    IdGenerator,
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
  exports: [IdGenerator],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*path');
  }
}
