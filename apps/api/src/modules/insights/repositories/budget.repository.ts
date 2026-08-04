import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type QueryFilter } from 'mongoose';

import { BaseRepository } from '../../../database/base.repository.js';
import { BudgetIdGenerator } from '../budget-id.js';
import { BUDGET_MODEL } from '../insights.constants.js';
import { type BudgetDocument, type BudgetSchemaClass } from '../schemas/budget.schema.js';

import { BudgetStore, type BudgetRecord, type UpsertBudget } from './budget.store.js';

type Filter = QueryFilter<BudgetSchemaClass>;

/** MongoDB-backed budget persistence — the production binding of {@link BudgetStore}. */
@Injectable()
export class BudgetRepository extends BaseRepository<BudgetSchemaClass> implements BudgetStore {
  constructor(
    @InjectModel(BUDGET_MODEL) model: Model<BudgetSchemaClass>,
    private readonly ids: BudgetIdGenerator,
  ) {
    super(model);
  }

  async listByUser(userId: string): Promise<BudgetRecord[]> {
    const documents = await this.find({ userId } as Filter, { sort: { category: 1 } });
    return documents.map((document) => toBudgetRecord(document));
  }

  async findByPublicId(id: string): Promise<BudgetRecord | null> {
    const document = await this.findOne({ id } as Filter);
    return document ? toBudgetRecord(document) : null;
  }

  /**
   * One atomic upsert on `(userId, category)`.
   *
   * `$setOnInsert` carries the id and the immutable fields so a second save updates the
   * limit without minting a new identifier — a budget the customer has adjusted is the
   * same budget, and anything holding a reference to it should keep working.
   */
  async upsert(input: UpsertBudget): Promise<BudgetRecord> {
    const updated = await this.collection
      .findOneAndUpdate(
        { userId: input.userId, category: input.category } as Filter,
        {
          $set: { limit: input.limit, alertAtBps: input.alertAtBps },
          $setOnInsert: {
            id: this.ids.generate(),
            userId: input.userId,
            category: input.category,
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    if (!updated) throw new Error('Budget upsert returned no document');
    return toBudgetRecord(updated);
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ id, userId } as Filter).exec();
    return result.deletedCount > 0;
  }
}

function toBudgetRecord(document: BudgetDocument): BudgetRecord {
  return {
    id: document.id,
    userId: document.userId,
    category: document.category,
    limit: { amount: document.limit.amount, currency: document.limit.currency },
    alertAtBps: document.alertAtBps,
  };
}
