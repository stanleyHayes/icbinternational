/**
 * The standing-orders module's public surface.
 *
 * Other lanes import from here, never from a file inside. The lane that will execute a
 * standing order needs three of these and no more: `TransferOrderStore.dueForRun` to find
 * what is due, the schedule arithmetic to work out what comes next, and the record type to
 * read the customer's instruction from. Nothing outside this folder has any business
 * knowing how an order is stored.
 */

export { TransferOrdersModule } from './transfer-orders.module.js';

export { TransferOrderService } from './transfer-order.service.js';
export { TransferOrderLifecycleService } from './transfer-order-lifecycle.service.js';

export {
  TransferOrderStore,
  type NewTransferOrder,
  type TransferOrderListQuery,
  type TransferOrderPatch,
  type TransferOrderPatchFields,
  type TransferOrderRecord,
} from './transfer-order.store.js';
export { TransferOrderRepository } from './transfer-order.repository.js';
export { InMemoryTransferOrderStore } from './in-memory-transfer-order.store.js';

export {
  anchorsFor,
  firstRunOn,
  nextRunOn,
  runFrom,
  type Schedule,
} from './transfer-order.schedule.js';

export { scheduleOf, toContractTransferOrder } from './transfer-order.mapper.js';

export {
  assertCurrencyMatches,
  assertLive,
  LIVE_STATUSES,
  orderNotFound,
  requirePayableAmount,
  requireSkippableRun,
  RUNNING_STATUSES,
} from './transfer-order.rules.js';

export {
  NEWEST_FIRST,
  TRANSFER_ORDER_AUDIT_ENTITY,
  TRANSFER_ORDER_COLLECTION,
  TRANSFER_ORDER_LABEL,
  TRANSFER_ORDER_MODEL,
  TRANSFER_ORDER_RUN_BATCH,
} from './transfer-order.constants.js';
export {
  TransferOrderSchema,
  TransferOrderSchemaClass,
  type TransferOrderDocument,
} from './transfer-order.schema.js';

export {
  listTransferOrdersQuerySchema,
  pauseTransferOrderRequestSchema,
  updateTransferOrderRequestSchema,
  type ListTransferOrdersQuery,
  type PauseTransferOrderRequest,
  type UpdateTransferOrderRequest,
} from './transfer-orders.dto.js';
