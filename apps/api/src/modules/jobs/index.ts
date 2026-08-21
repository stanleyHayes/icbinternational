/**
 * Public surface of the scheduled-task platform.
 *
 * Lanes import the base class to schedule recurring work with. There is no queue to enqueue
 * onto: work is found by sweeping its own due set out of MongoDB on a fixed interval.
 */
export { BaseScheduledTask, type ScheduledTaskOptions } from './scheduled-task.js';
export { DEFAULT_SWEEP_BATCH_SIZE } from './jobs.constants.js';
