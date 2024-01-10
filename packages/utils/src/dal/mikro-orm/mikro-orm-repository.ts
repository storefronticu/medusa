import {
  Context,
  DAL,
  FilterQuery as InternalFilerQuery,
  RepositoryTransformOptions,
} from "@medusajs/types"
import { arrayDifference, isString, MedusaError } from "../../common"
import { MedusaContext } from "../../decorators"
import { buildQuery, InjectTransactionManager } from "../../modules-sdk"
import {
  getSoftDeletedCascadedEntitiesIdsMappedBy,
  transactionWrapper,
} from "../utils"
import { mikroOrmSerializer, mikroOrmUpdateDeletedAtRecursively } from "./utils"
import {
  EntityManager,
  EntitySchema,
  FilterQuery,
  LoadStrategy,
  RequiredEntityData,
} from "@mikro-orm/core"
import {
  EntityClass,
  EntityName,
  FilterQuery as MikroFilterQuery,
} from "@mikro-orm/core/typings"
import { FindOptions as MikroOptions } from "@mikro-orm/core/drivers/IDatabaseDriver"

export class MikroOrmBase<T = any> {
  readonly manager_: any

  protected constructor({ manager }) {
    this.manager_ = manager
  }

  getFreshManager<TManager = unknown>(): TManager {
    return (this.manager_.fork
      ? this.manager_.fork()
      : this.manager_) as unknown as TManager
  }

  getActiveManager<TManager = unknown>(
    @MedusaContext()
    { transactionManager, manager }: Context = {}
  ): TManager {
    return (transactionManager ?? manager ?? this.manager_) as TManager
  }

  async transaction<TManager = unknown>(
    task: (transactionManager: TManager) => Promise<any>,
    options: {
      isolationLevel?: string
      enableNestedTransactions?: boolean
      transaction?: TManager
    } = {}
  ): Promise<any> {
    // @ts-ignore
    return await transactionWrapper.bind(this)(task, options)
  }

  async serialize<TOutput extends object | object[]>(
    data: any,
    options?: any
  ): Promise<TOutput> {
    return await mikroOrmSerializer<TOutput>(data, options)
  }
}

/**
 * Privileged extends of the abstract classes unless most of the methods can't be implemented
 * in your repository. This base repository is also used to provide a base repository
 * injection if needed to be able to use the common methods without being related to an entity.
 * In this case, none of the method will be implemented except the manager and transaction
 * related ones.
 */

export class MikroOrmBaseRepository<
  T extends object = object
> extends MikroOrmBase<T> {
  constructor() {
    // @ts-ignore
    super(...arguments)
  }
  create(data: unknown[], context?: Context): Promise<T[]> {
    throw new Error("Method not implemented.")
  }

  update(data: unknown[], context?: Context): Promise<T[]> {
    throw new Error("Method not implemented.")
  }

  delete(ids: string[], context?: Context): Promise<void> {
    throw new Error("Method not implemented.")
  }

  find(options?: DAL.FindOptions<T>, context?: Context): Promise<T[]> {
    throw new Error("Method not implemented.")
  }

  findAndCount(
    options?: DAL.FindOptions<T>,
    context?: Context
  ): Promise<[T[], number]> {
    throw new Error("Method not implemented.")
  }

  @InjectTransactionManager()
  async softDelete(
    idsOrFilter: string[] | InternalFilerQuery,
    @MedusaContext()
    { transactionManager: manager }: Context = {}
  ): Promise<[T[], Record<string, unknown[]>]> {
    const isArray = Array.isArray(idsOrFilter)
    const filter =
      isArray || isString(idsOrFilter)
        ? {
            id: {
              $in: isArray ? idsOrFilter : [idsOrFilter],
            },
          }
        : idsOrFilter

    const entities = await this.find({ where: filter as any })
    const date = new Date()

    await mikroOrmUpdateDeletedAtRecursively<T>(
      manager,
      entities as any[],
      date
    )

    const softDeletedEntitiesMap = getSoftDeletedCascadedEntitiesIdsMappedBy({
      entities,
    })

    return [entities, softDeletedEntitiesMap]
  }

  @InjectTransactionManager()
  async restore(
    idsOrFilter: string[] | InternalFilerQuery,
    @MedusaContext()
    { transactionManager: manager }: Context = {}
  ): Promise<[T[], Record<string, unknown[]>]> {
    const isArray = Array.isArray(idsOrFilter)
    const filter =
      isArray || isString(idsOrFilter)
        ? {
            id: {
              $in: isArray ? idsOrFilter : [idsOrFilter],
            },
          }
        : idsOrFilter

    const query = buildQuery(filter, {
      withDeleted: true,
    })

    const entities = await this.find(query)

    await mikroOrmUpdateDeletedAtRecursively(manager, entities as any[], null)

    const softDeletedEntitiesMap = getSoftDeletedCascadedEntitiesIdsMappedBy({
      entities,
      restored: true,
    })

    return [entities, softDeletedEntitiesMap]
  }

  applyFreeTextSearchFilters<T>(
    findOptions: DAL.FindOptions<T & { q?: string }>,
    retrieveConstraintsToApply: (q: string) => any[]
  ): void {
    if (!("q" in findOptions.where) || !findOptions.where.q) {
      delete findOptions.where.q

      return
    }

    const q = findOptions.where.q as string
    delete findOptions.where.q

    findOptions.where = {
      $and: [findOptions.where, { $or: retrieveConstraintsToApply(q) }],
    } as unknown as DAL.FilterQuery<T & { q?: string }>
  }
}

export class MikroOrmBaseTreeRepository<
  T extends object = object
> extends MikroOrmBase<T> {
  constructor() {
    // @ts-ignore
    super(...arguments)
  }

  find(
    options?: DAL.FindOptions,
    transformOptions?: RepositoryTransformOptions,
    context?: Context
  ): Promise<T[]> {
    throw new Error("Method not implemented.")
  }

  findAndCount(
    options?: DAL.FindOptions,
    transformOptions?: RepositoryTransformOptions,
    context?: Context
  ): Promise<[T[], number]> {
    throw new Error("Method not implemented.")
  }

  create(data: unknown, context?: Context): Promise<T> {
    throw new Error("Method not implemented.")
  }

  delete(id: string, context?: Context): Promise<void> {
    throw new Error("Method not implemented.")
  }
}

type DtoBasedMutationMethods = "create" | "update"

export function mikroOrmBaseRepositoryFactory<
  T extends object = object,
  TDTos extends { [K in DtoBasedMutationMethods]?: any } = {
    [K in DtoBasedMutationMethods]?: any
  }
>(
  entity: EntityClass<T> | EntitySchema<T> | string,
  primaryKey: string = "id"
) {
  class MikroOrmAbstractBaseRepository_ extends MikroOrmBaseRepository<T> {
    async create(data: TDTos["create"][], context?: Context): Promise<T[]> {
      const manager = this.getActiveManager<EntityManager>(context)

      const entities = data.map((data_) => {
        return manager.create(
          entity as EntityName<T>,
          data_ as RequiredEntityData<T>
        )
      })

      manager.persist(entities)

      return entities
    }

    async update(data: TDTos["update"][], context?: Context): Promise<T[]> {
      const manager = this.getActiveManager<EntityManager>(context)

      const primaryKeyValues: string[] = data.map((data_) => data_[primaryKey])
      const existingEntities = await this.find(
        {
          where: {
            [primaryKey]: {
              $in: primaryKeyValues,
            },
          },
        } as DAL.FindOptions<T>,
        context
      )

      const missingEntities = arrayDifference(
        data.map((d) => d[primaryKey]),
        existingEntities.map((d: any) => d[primaryKey])
      )

      if (missingEntities.length) {
        const entityName = (entity as EntityClass<T>).name ?? entity
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          `${entityName} with ${[primaryKey]} "${missingEntities.join(
            ", "
          )}" not found`
        )
      }

      const existingEntitiesMap = new Map(
        existingEntities.map<[string, T]>((entity_: any) => [
          entity_[primaryKey],
          entity_,
        ])
      )

      const entities = data.map((data_) => {
        const existingEntity = existingEntitiesMap.get(data_[primaryKey])!
        return manager.assign(existingEntity, data_ as RequiredEntityData<T>)
      })

      manager.persist(entities)

      return entities
    }

    async delete(primaryKeyValues: string[], context?: Context): Promise<void> {
      const manager = this.getActiveManager<EntityManager>(context)

      await manager.nativeDelete<T>(
        entity as EntityName<T>,
        { [primaryKey]: { $in: primaryKeyValues } } as unknown as FilterQuery<T>
      )
    }

    async find(options?: DAL.FindOptions<T>, context?: Context): Promise<T[]> {
      const manager = this.getActiveManager<EntityManager>(context)

      const findOptions_ = { ...options }
      findOptions_.options ??= {}

      Object.assign(findOptions_.options, {
        strategy: LoadStrategy.SELECT_IN,
      })

      return await manager.find(
        entity as EntityName<T>,
        findOptions_.where as MikroFilterQuery<T>,
        findOptions_.options as MikroOptions<T>
      )
    }

    async findAndCount(
      findOptions: DAL.FindOptions<T> = { where: {} },
      context: Context = {}
    ): Promise<[T[], number]> {
      const manager = this.getActiveManager<EntityManager>(context)

      const findOptions_ = { ...findOptions }
      findOptions_.options ??= {}

      Object.assign(findOptions_.options, {
        strategy: LoadStrategy.SELECT_IN,
      })

      return await manager.findAndCount(
        entity as EntityName<T>,
        findOptions_.where as MikroFilterQuery<T>,
        findOptions_.options as MikroOptions<T>
      )
    }
  }

  return MikroOrmAbstractBaseRepository_
}
