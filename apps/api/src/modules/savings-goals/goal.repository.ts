import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';

import { GOAL_MODEL } from './goal.constants.js';
import { GoalSchemaClass, type GoalDocument } from './goal.schema.js';
import {
  GoalStore,
  type AutoSaveQuery,
  type GoalPatchFields,
  type GoalQuery,
  type GoalRecord,
  pickPatchFields,
  type NewGoal,
  type VaultWriteInput,
} from './goal.store.js';

/** A goal nobody has closed. Every automation and every vault write is scoped by it. */
const OPEN: QueryFilter<GoalSchemaClass> = { closedAt: null };

/**
 * MongoDB-backed savings goal persistence.
 *
 * Every write is a targeted `findOneAndUpdate`, never `document.save()`: a customer
 * renaming a goal and a round-up funding it touch different fields of the same document
 * at the same moment, and a whole-document save would let either overwrite the other with
 * its own stale copy.
 *
 * {@link applyVaultMovement} goes further and is conditional on the balance and movement
 * count it was computed from. Inside a transaction MongoDB would already abort the loser
 * of two concurrent writes to one goal, but the condition also covers the case the server
 * cannot see: a caller that read the goal, awaited a posting, and came back to write a
 * figure the world had moved past.
 */
@Injectable()
export class GoalRepository extends GoalStore {
  constructor(
    @InjectModel(GOAL_MODEL) private readonly model: Model<GoalSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  override async insert(goal: NewGoal, session?: ClientSession): Promise<GoalRecord> {
    const draft = { ...goal, id: this.ids.generate('goal'), version: 0 };

    // `create()`'s overloads cannot express a partial of the raw document type, which is
    // the same cast every repository in this tree makes; `NewGoal` guarantees the shape.
    const created = (await this.model.create([draft] as never[], {
      session: session ?? undefined,
    })) as GoalDocument[];

    const [inserted] = created;
    if (!inserted) throw new Error('Mongo accepted a savings goal insert but returned nothing');
    return toRecord(inserted);
  }

  override async findById(id: string, session?: ClientSession): Promise<GoalRecord | null> {
    const document = await this.model
      .findOne({ id })
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as GoalDocument) : null;
  }

  override async list(query: GoalQuery): Promise<GoalRecord[]> {
    const filter: QueryFilter<GoalSchemaClass> = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.openOnly ? OPEN : {}),
    };

    const documents = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .session(query.session ?? null)
      .exec();

    return documents.map((document) => toRecord(document as GoalDocument));
  }

  override async listRoundUpTargets(
    accountId: string,
    session?: ClientSession,
  ): Promise<GoalRecord[]> {
    const documents = await this.model
      .find({ ...OPEN, linkedAccountId: accountId, roundUpsEnabled: true })
      .sort({ createdAt: 1 })
      .session(session ?? null)
      .exec();

    return documents.map((document) => toRecord(document as GoalDocument));
  }

  override async patch(
    id: string,
    fields: GoalPatchFields,
    session?: ClientSession,
  ): Promise<GoalRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        { id },
        { $set: pickPatchFields(fields), $inc: { version: 1 } },
        { new: true, session: session ?? null },
      )
      .exec();

    return document ? toRecord(document as GoalDocument) : null;
  }

  /**
   * Moves the vault balance if — and only if — it is still the one the delta was taken
   * against.
   *
   * The filter carries the whole precondition: the goal is still open, still holds
   * `expected`, and has still seen `expectedMovementCount` movements. A `matchedCount` of
   * nought is not a missing goal, it is a lost race, and the caller aborts on it.
   */
  override async applyVaultMovement(write: VaultWriteInput): Promise<GoalRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        {
          ...OPEN,
          id: write.goalId,
          'currentAmount.amount': write.expected.amount,
          'currentAmount.currency': write.expected.currency,
          movementCount: write.expectedMovementCount,
        },
        {
          $set: { currentAmount: write.balance, completedAt: write.completedAt },
          $inc: { movementCount: 1, version: 1 },
        },
        { new: true, session: write.session ?? null },
      )
      .exec();

    return document ? toRecord(document as GoalDocument) : null;
  }

  override async listAutoSaveDue(query: AutoSaveQuery): Promise<GoalRecord[]> {
    const documents = await this.model
      .find({ ...OPEN, 'autoSave.nextRunOn': { $lte: query.asOf } })
      .sort({ createdAt: 1 })
      .limit(query.limit)
      .session(query.session ?? null)
      .exec();

    return documents.map((document) => toRecord(document as GoalDocument));
  }
}

/** Hydrated document to plain record. The record is what leaves the repository. */
function toRecord(document: GoalDocument): GoalRecord {
  const plain = document.toObject<GoalSchemaClass>();

  return {
    ...plain,
    targetAmount: { ...plain.targetAmount },
    currentAmount: { ...plain.currentAmount },
    autoSave: plain.autoSave
      ? {
          amount: { ...plain.autoSave.amount },
          frequency: plain.autoSave.frequency,
          nextRunOn: plain.autoSave.nextRunOn,
        }
      : null,
  };
}
