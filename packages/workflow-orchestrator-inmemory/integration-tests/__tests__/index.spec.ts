import { MedusaApp } from "@medusajs/modules-sdk"
import {
  IWorkflowOrchestratorModuleService,
  RemoteJoinerQuery,
} from "@medusajs/types"
import { TransactionHandlerType } from "@medusajs/utils"
import { knex } from "knex"
import "../__fixtures__/"
import { DB_URL, TestDatabase } from "../utils"

let sharedPgConnection = knex<any, any>({
  client: "pg",
  searchPath: process.env.MEDUSA_PRODUCT_DB_SCHEMA,
  connection: {
    connectionString: DB_URL,
  },
})

const afterEach_ = async () => {
  await TestDatabase.clearTables(sharedPgConnection)
}

describe("Workflow Orchestrator module", function () {
  describe("Testing basic workflow", function () {
    let workflowOrcModule: IWorkflowOrchestratorModuleService
    let query: (
      query: string | RemoteJoinerQuery | object,
      variables?: Record<string, unknown>
    ) => Promise<any>

    afterEach(afterEach_)

    beforeAll(async () => {
      const {
        runMigrations,
        query: remoteQuery,
        modules,
      } = await MedusaApp({
        sharedResourcesConfig: {
          database: {
            connection: sharedPgConnection,
          },
        },
        modulesConfig: {
          workflowOrchestrator: {
            options: {
              database: {
                clientUrl: DB_URL,
                schema: process.env.MEDUSA_PRODUCT_DB_SCHEMA,
                // debug: true,
              },
            },
          },
        },
      })

      query = remoteQuery

      await runMigrations()

      workflowOrcModule =
        modules.workflowOrchestrator as unknown as IWorkflowOrchestratorModuleService
    })

    afterEach(afterEach_)

    it("should return a list of workflow executions and remove after completed when there is no retentionTime set", async () => {
      await workflowOrcModule.run("workflow_1", {
        input: {
          value: "123",
        },
        throwOnError: true,
      })

      let executionsList = await query({
        workflow_executions: {
          fields: ["workflow_id", "transaction_id", "state"],
        },
      })

      expect(executionsList).toHaveLength(1)

      const { result } = await workflowOrcModule.setStepSuccess({
        idempotencyKey: {
          action: TransactionHandlerType.INVOKE,
          stepId: "new_step_name",
          workflowId: "workflow_1",
          transactionId: executionsList[0].transaction_id,
        },
        stepResponse: { uhuuuu: "yeaah!" },
      })

      executionsList = await query({
        workflow_executions: {
          fields: ["id"],
        },
      })

      expect(executionsList).toHaveLength(0)
      expect(result).toEqual({
        done: {
          inputFromSyncStep: "oh",
        },
      })
    })

    it("should return a list of workflow executions and keep it saved when there is a retentionTime set", async () => {
      await workflowOrcModule.run("workflow_2", {
        input: {
          value: "123",
        },
        throwOnError: true,
        transactionId: "transaction_1",
      })

      let executionsList = await query({
        workflow_executions: {
          fields: ["id"],
        },
      })

      expect(executionsList).toHaveLength(1)

      await workflowOrcModule.setStepSuccess({
        idempotencyKey: {
          action: TransactionHandlerType.INVOKE,
          stepId: "new_step_name",
          workflowId: "workflow_2",
          transactionId: "transaction_1",
        },
        stepResponse: { uhuuuu: "yeaah!" },
      })

      executionsList = await query({
        workflow_executions: {
          fields: ["id"],
        },
      })

      expect(executionsList).toHaveLength(1)
    })
  })
})