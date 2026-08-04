import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../auth/users/index.js';
import { NotificationsModule } from '../notifications/index.js';
import { RbacModule } from '../rbac/index.js';

import { AdminTicketsController } from './admin-tickets.controller.js';
import { NotificationBusTicketNotifier } from './ports/notification-bus-ticket-notifier.js';
import { TicketNotifier } from './ports/ticket-notifier.port.js';
import { TicketAgentService } from './ticket-agent.service.js';
import { TicketConversationService } from './ticket-conversation.service.js';
import { TicketOpenService } from './ticket-open.service.js';
import { TicketQueryService } from './ticket-query.service.js';
import { TicketRepository } from './ticket.repository.js';
import { TicketSchema } from './ticket.schema.js';
import { TicketStore } from './ticket.store.js';
import { TICKET_MODEL } from './tickets.constants.js';
import { TicketsController } from './tickets.controller.js';

/**
 * Support tickets: the customer's conversations with the bank, and the queue staff work.
 *
 * ## Where the collaborators come from, and why
 *
 * `UsersModule` supplies `UsersService`, and it is here for one narrow reason: a message
 * has to be signed with the name the customer would recognise. It is denormalised onto
 * each message at the moment it is written, so this module reads a customer record on a
 * write and never on a read.
 *
 * `NotificationsModule` backs the notifier port. The `TICKET_RECEIVED`, `TICKET_REPLY` and
 * `TICKET_RESOLVED` templates already existed in the platform's catalogue and already tell
 * the customer a reply time and that a settled case reopens if they answer; this module is
 * what makes those statements true.
 *
 * `RbacModule` is imported for the guard chain behind `@AdminEndpoint`, and `AuthModule`
 * for the customer guards. Importing them is what makes those routes genuinely protected
 * rather than merely decorated.
 *
 * There is no `LedgerModule` here, and there should not be. Nothing in this module moves
 * money — a conversation about a payment is not the payment — so it takes no posting
 * service and runs no database transaction. A ticket is one document and every change to
 * it is one atomic update.
 *
 * `TicketRepository` is registered under its own class as well as under `TicketStore`: the
 * audit interceptor resolves the loader by class from the container, and `useExisting`
 * keeps both tokens pointing at one instance rather than at two connections to the same
 * collection.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: TICKET_MODEL, schema: TicketSchema }]),
    UsersModule,
    NotificationsModule,
    AuthModule,
    RbacModule,
    AuditModule,
  ],
  controllers: [TicketsController, AdminTicketsController],
  providers: [
    TicketRepository,
    { provide: TicketStore, useExisting: TicketRepository },
    { provide: TicketNotifier, useClass: NotificationBusTicketNotifier },

    TicketQueryService,
    TicketOpenService,
    TicketConversationService,
    TicketAgentService,

    // Provided locally, as the disputes and ledger lanes do, so the module stands up in a
    // test that wires only a Mongoose connection rather than the whole application root.
    IdGenerator,
  ],
  exports: [TicketStore, TicketQueryService, TicketOpenService],
})
export class TicketsModule {}
