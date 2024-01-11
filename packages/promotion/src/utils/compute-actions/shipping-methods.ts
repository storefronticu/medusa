import { PromotionTypes } from "@medusajs/types"
import {
  ApplicationMethodAllocation,
  ApplicationMethodTargetType,
  MedusaError,
} from "@medusajs/utils"
import { areRulesValidForContext } from "../validations"

export function getComputedActionsForShippingMethods(
  promotion: PromotionTypes.PromotionDTO,
  shippingMethodApplicationContext: PromotionTypes.ComputeActionContext[ApplicationMethodTargetType.SHIPPING_METHODS],
  itemIdPromoValueMap: Map<string, number>
): PromotionTypes.ComputeActions[] {
  const applicableShippingItems: PromotionTypes.ComputeActionContext[ApplicationMethodTargetType.SHIPPING_METHODS] =
    []

  if (!shippingMethodApplicationContext) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `"items" not found in context`
    )
  }

  for (const shippingMethodContext of shippingMethodApplicationContext) {
    const isPromotionApplicableToItem = areRulesValidForContext(
      promotion.application_method?.target_rules!,
      shippingMethodContext
    )

    if (!isPromotionApplicableToItem) {
      continue
    }

    applicableShippingItems.push(shippingMethodContext)
  }

  return applyPromotionToShippingMethods(
    promotion,
    applicableShippingItems,
    itemIdPromoValueMap
  )
}

export function applyPromotionToShippingMethods(
  promotion: PromotionTypes.PromotionDTO,
  shippingMethods: PromotionTypes.ComputeActionContext[ApplicationMethodTargetType.SHIPPING_METHODS],
  itemIdPromoValueMap: Map<string, number>
): PromotionTypes.ComputeActions[] {
  const { application_method: applicationMethod } = promotion
  const allocation = applicationMethod?.allocation!
  const computedActions: PromotionTypes.ComputeActions[] = []

  if (allocation === ApplicationMethodAllocation.EACH) {
    for (const item of shippingMethods!) {
      const appliedPromoValue = itemIdPromoValueMap.get(item.id) || 0
      const promotionValue = parseFloat(applicationMethod!.value!)
      let amount = promotionValue
      const applicableTotal = item.unit_price - appliedPromoValue

      if (promotionValue > applicableTotal) {
        amount = applicableTotal
      }

      if (amount <= 0) {
        continue
      }

      itemIdPromoValueMap.set(item.id, appliedPromoValue + amount)

      computedActions.push({
        action: "addShippingMethodAdjustment",
        shipping_method_id: item.id,
        amount,
        code: promotion.code!,
      })
    }
  }

  if (allocation === ApplicationMethodAllocation.ACROSS) {
    const totalApplicableValue = shippingMethods!.reduce((acc, item) => {
      const appliedPromoValue = itemIdPromoValueMap.get(item.id) || 0

      return acc + item.unit_price - appliedPromoValue
    }, 0)

    if (totalApplicableValue <= 0) {
      return computedActions
    }

    for (const item of shippingMethods!) {
      const promotionValue = parseFloat(applicationMethod!.value!)
      const applicableTotal = item.unit_price
      const appliedPromoValue = itemIdPromoValueMap.get(item.id) || 0

      // TODO: should we worry about precision here?
      const applicablePromotionValue =
        (applicableTotal / totalApplicableValue) * promotionValue -
        appliedPromoValue

      let amount = applicablePromotionValue

      if (applicablePromotionValue > applicableTotal) {
        amount = applicableTotal
      }

      if (amount <= 0) {
        continue
      }

      itemIdPromoValueMap.set(item.id, appliedPromoValue + amount)

      computedActions.push({
        action: "addShippingMethodAdjustment",
        shipping_method_id: item.id,
        amount,
        code: promotion.code!,
      })
    }
  }

  return computedActions
}