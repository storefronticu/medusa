import * as defaultRepositories from "@repositories"

import { LoaderOptions } from "@medusajs/modules-sdk"
import { ModulesSdkTypes } from "@medusajs/types"
import { loadCustomRepositories } from "@medusajs/utils"
import * as defaultServices from "@services"
import { asClass } from "awilix"
import { InMemoryDistributedTransactionStorage } from "../utils"

export default async ({
  container,
  options,
}: LoaderOptions<
  | ModulesSdkTypes.ModuleServiceInitializeOptions
  | ModulesSdkTypes.ModuleServiceInitializeCustomDataLayerOptions
>): Promise<void> => {
  const customRepositories = (
    options as ModulesSdkTypes.ModuleServiceInitializeCustomDataLayerOptions
  )?.repositories

  container.register({
    workflowExecutionService: asClass(
      defaultServices.WorkflowExecutionService
    ).singleton(),
    workflowOrchestratorService: asClass(
      defaultServices.WorkflowOrchestratorService
    ).singleton(),

    inMemoryDistributedTransactionStorage: asClass(
      InMemoryDistributedTransactionStorage
    ).singleton(),
  })

  if (customRepositories) {
    loadCustomRepositories({
      defaultRepositories,
      customRepositories,
      container,
    })
  } else {
    loadDefaultRepositories({ container })
  }
}

function loadDefaultRepositories({ container }) {
  container.register({
    baseRepository: asClass(defaultRepositories.BaseRepository).singleton(),
    workflowExecutionRepository: asClass(
      defaultRepositories.WorkflowExecutionRepository
    ).singleton(),
  })
}