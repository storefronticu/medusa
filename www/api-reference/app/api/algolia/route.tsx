import OpenAPIParser from "@readme/openapi-parser"
import algoliasearch from "algoliasearch"
import type { ExpandedDocument, Operation } from "../../../types/openapi"
import path from "path"
import getPathsOfTag from "../../../utils/get-paths-of-tag"
import getSectionId from "../../../utils/get-section-id"
import { NextResponse } from "next/server"
import got from "got"
import { JSDOM } from "jsdom"
import capitalize from "../../../utils/capitalize"

export async function GET() {
  const algoliaClient = algoliasearch(
    process.env.NEXT_PUBLIC_ALGOLIA_APP_ID || "",
    process.env.ALGOLIA_WRITE_API_KEY || ""
  )
  const index = algoliaClient.initIndex(
    process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME || ""
  )

  // retrieve tags and their operations to index them
  const indices: Record<string, any>[] = []
  for (const area of ["store", "admin"]) {
    // find and parse static headers from pages
    const pageContent = (
      await got(getUrl(area), {
        https: {
          rejectUnauthorized: false,
        },
      })
    ).body
    const dom = new JSDOM(pageContent, {
      resources: "usable",
      includeNodeLocations: true,
    })
    const headers = dom.window.document.querySelectorAll("h2")
    headers.forEach((header) => {
      if (!header.textContent) {
        return
      }

      const objectID = getSectionId([header.textContent])
      const url = getUrl(area, objectID)
      indices.push({
        objectID: getObjectId(area, `${objectID}-mdx-section`),
        hierarchy: getHierarchy(area, [header.textContent]),
        type: `content`,
        content: header.textContent,
        version: ["current"],
        lang: "en",
        tags: ["api", area],
        url,
        url_without_variables: url,
        url_without_anchor: url,
      })
    })

    // find and index tag and operations
    const baseSpecs = (await OpenAPIParser.parse(
      path.join(process.cwd(), `specs/${area}/openapi.yaml`)
    )) as ExpandedDocument

    await Promise.all(
      baseSpecs.tags?.map(async (tag) => {
        const tagName = getSectionId([tag.name])
        const url = getUrl(area, tagName)
        indices.push({
          objectID: getObjectId(area, tagName),
          hierarchy: getHierarchy(area, [tag.name]),
          type: "lvl1",
          content: null,
          version: ["current"],
          lang: "en",
          tags: ["api", area],
          url,
          url_without_variables: url,
          url_without_anchor: url,
        })
        const paths = await getPathsOfTag(tagName, area)

        Object.values(paths.paths).forEach((path) => {
          Object.values(path).forEach((op) => {
            const operation = op as Operation
            const operationName = getSectionId([
              tag.name,
              operation.operationId,
            ])
            const url = getUrl(area, operationName)
            indices.push({
              objectID: getObjectId(area, operationName),
              hierarchy: getHierarchy(area, [tag.name, operation.summary]),
              type: "content",
              content: operation.summary,
              content_camel: operation.summary,
              lang: "en",
              version: ["current"],
              url,
              url_without_variables: url,
              url_without_anchor: url,
            })

            // index its description
            const operationDescriptionId = getSectionId([
              tag.name,
              operation.operationId,
              operation.description.substring(
                0,
                Math.min(20, operation.description.length)
              ),
            ])

            indices.push({
              objectID: getObjectId(area, operationDescriptionId),
              hierarchy: getHierarchy(area, [
                tag.name,
                operation.summary,
                operation.description,
              ]),
              type: "content",
              content: operation.description,
              content_camel: operation.description,
              lang: "en",
              version: ["current"],
              url,
              url_without_variables: url,
              url_without_anchor: url,
            })
          })
        })
      }) || []
    )
  }

  if (indices.length) {
    await index.saveObjects(indices, {
      autoGenerateObjectIDIfNotExist: true,
    })
  }

  return NextResponse.json({
    message: "done",
  })
}

function getObjectId(area: string, objectName: string): string {
  return `${area}_${objectName}`
}

function getHierarchy(area: string, levels: string[]): Record<string, string> {
  const heirarchy: Record<string, string> = {
    lvl0: `${capitalize(area)} API Reference`,
  }

  let counter = 1
  levels.forEach((level) => {
    heirarchy[`lvl${counter}`] = level
    counter++
  })

  return heirarchy
}

function getUrl(area: string, name?: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_URL}/api/${area}#${name}`
}
