import crypto from "crypto";

import {
    getStockForPicker,
    getActivePickerSkus
} from "../database/stockPicker.repository.js";


const PLAN_TTL =
    30 * 60 * 1000;

const plans =
    new Map();


function normalizeSku(sku) {
    if (
        typeof sku !== "string" &&
        typeof sku !== "number"
    ) {
        throw new Error(
            "SKU is required"
        );
    }

    const normalized =
        String(sku).trim();

    if (!normalized) {
        throw new Error(
            "SKU is required"
        );
    }

    return normalized;
}


function normalizeRequiredQuantity(
    quantity
) {
    const normalized =
        Number(quantity);

    if (
        !Number.isFinite(normalized) ||
        normalized <= 0
    ) {
        throw new Error(
            "Required quantity must be greater than 0"
        );
    }

    return normalized;
}


function getStatus({
    required,
    available
}) {
    if (
        available < required
    ) {
        return "short";
    }

    if (
        available > required
    ) {
        return "excess";
    }

    return "enough";
}


function cleanupExpiredPlans() {
    const now =
        Date.now();

    for (
        const [
            planId,
            plan
        ] of plans
    ) {
        if (
            now -
                plan.createdAt >
            PLAN_TTL
        ) {
            plans.delete(
                planId
            );
        }
    }
}


export async function generateStockPickingPlan({
    rows
}) {
    if (
        !Array.isArray(rows) ||
        rows.length === 0
    ) {
        throw new Error(
            "At least one SKU is required"
        );
    }

    /*
     * Combine duplicate SKU rows.
     */
    const requiredBySku =
        new Map();

    rows.forEach(
        (row, index) => {
            if (
                !row ||
                typeof row !==
                    "object"
            ) {
                throw new Error(
                    `Invalid row at Excel row ${index + 2}`
                );
            }

            const sku =
                normalizeSku(
                    row.sku
                );

            const required =
                normalizeRequiredQuantity(
                    row.requiredQuantity
                );

            requiredBySku.set(
                sku,
                (
                    requiredBySku.get(
                        sku
                    ) || 0
                ) + required
            );
        }
    );

    const skus =
        Array.from(
            requiredBySku.keys()
        );

    /*
     * Validate all SKUs in one query.
     */
    const activeSkuRows =
        await getActivePickerSkus({
            skus
        });

    const activeSkuSet =
        new Set(
            activeSkuRows.map(
                (row) =>
                    row.sku_name
            )
        );

    const invalidSkus =
        skus.filter(
            (sku) =>
                !activeSkuSet.has(
                    sku
                )
        );

    if (
        invalidSkus.length > 0
    ) {
        throw new Error(
            `The following SKU(s) do not exist or are inactive: ${invalidSkus.join(", ")}`
        );
    }

    /*
     * Fetch all stock locations for
     * all requested SKUs in one query.
     */
    const stockRows =
        await getStockForPicker({
            skus
        });

    const stockBySku =
        new Map();

    stockRows.forEach(
        (row) => {
            const sku =
                String(row.sku);

            if (
                !stockBySku.has(
                    sku
                )
            ) {
                stockBySku.set(
                    sku,
                    []
                );
            }

            stockBySku
                .get(sku)
                .push({
                    godownId:
                        Number(
                            row.godown_id
                        ),

                    godownName:
                        row.godown_name,

                    rackId:
                        Number(
                            row.rack_id
                        ),

                    rackName:
                        row.rack_name,

                    available:
                        Number(
                            row.quantity
                        )
                });
        }
    );

    const items = [];

    requiredBySku.forEach(
        (
            required,
            sku
        ) => {
            const locations =
                stockBySku.get(
                    sku
                ) || [];

            /*
             * Always start with the
             * location containing the
             * highest quantity.
             */
            locations.sort(
                (
                    a,
                    b
                ) =>
                    b.available -
                        a.available
            );

            const totalAvailable =
                locations.reduce(
                    (
                        total,
                        location
                    ) =>
                        total +
                        location.available,
                    0
                );

            let remaining =
                required;

            const pickingLocations =
                [];

            /*
             * Stop immediately when
             * the requirement is fulfilled.
             */
            for (
                const location of
                    locations
            ) {
                if (
                    remaining <= 0
                ) {
                    break;
                }

                const pickQuantity =
                    Math.min(
                        location.available,
                        remaining
                    );

                if (
                    pickQuantity <= 0
                ) {
                    continue;
                }

                pickingLocations.push({
                    godownId:
                        location.godownId,

                    godownName:
                        location.godownName,

                    rackId:
                        location.rackId,

                    rackName:
                        location.rackName,

                    available:
                        location.available,

                    pick:
                        pickQuantity
                });

                remaining -=
                    pickQuantity;
            }

            const picked =
                required -
                remaining;

            items.push({
                sku,
                required,
                available:
                    totalAvailable,
                picked,
                short:
                    Math.max(
                        remaining,
                        0
                    ),
                excess:
                    Math.max(
                        totalAvailable -
                            required,
                        0
                    ),
                status:
                    getStatus({
                        required,
                        available:
                            totalAvailable
                    }),
                locations:
                    pickingLocations
            });
        }
    );

    const summary = {
        totalSkus:
            items.length,

        enough:
            items.filter(
                (item) =>
                    item.status ===
                    "enough"
            ).length,

        excess:
            items.filter(
                (item) =>
                    item.status ===
                    "excess"
            ).length,

        short:
            items.filter(
                (item) =>
                    item.status ===
                    "short"
            ).length
    };

    cleanupExpiredPlans();

    const planId =
        crypto.randomUUID();

    plans.set(
        planId,
        {
            createdAt:
                Date.now(),

            items,
            summary
        }
    );

    return {
        planId,
        items,
        summary
    };
}


export function getStockPickingPlan(
    planId
) {
    cleanupExpiredPlans();

    const plan =
        plans.get(
            planId
        );

    if (!plan) {
        return null;
    }

    return plan;
}