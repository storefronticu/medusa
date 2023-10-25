import {
  SchemaObjectRepresentation,
  schemaObjectRepresentationPropertiesToOmit,
} from "../types"
import { SqlEntityManager } from "@mikro-orm/postgresql"

export async function createPartitions(
  schemaObjectRepresentation: SchemaObjectRepresentation,
  manager: SqlEntityManager
): Promise<void> {
  const activeSchema = manager.config.get("schema")
    ? `"${manager.config.get("schema")}".`
    : ""
  const partitions = Object.keys(schemaObjectRepresentation)
    .filter((key) => !schemaObjectRepresentationPropertiesToOmit.includes(key))
    .map((key) => {
      const cName = key.toLowerCase()
      const part: string[] = []
      part.push(
        `CREATE TABLE IF NOT EXISTS ${activeSchema}cat_${cName} PARTITION OF ${activeSchema}catalog FOR VALUES IN ('${key}')`
      )

      for (const parent of schemaObjectRepresentation[key].parents) {
        const pKey = `${parent.ref.entity}-${key}`
        const pName = `${parent.ref.entity}${key}`.toLowerCase()
        part.push(
          `CREATE TABLE IF NOT EXISTS ${activeSchema}cat_pivot_${pName} PARTITION OF ${activeSchema}catalog_relation FOR VALUES IN ('${pKey}')`
        )
      }
      return part
    })
    .flat()

  partitions.push(`analyse ${activeSchema}catalog`)
  partitions.push(`analyse ${activeSchema}catalog_relation`)

  await manager.execute(partitions.join("; "))
}