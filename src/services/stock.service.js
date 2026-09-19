import { getPool } from "../config/database.js";

import {
    getStockRow,
    getStockList as getPaginatedStockList,
    insertStock,
    incrementStock,
    decrementStock,
    getStockSummary,
    getActiveSkus,
    getActiveGodowns,
    getActiveRacks,
    getStockRowsForMovements,
    insertStockBatch,
    updateStockQuantitiesBatch
} from "../database/stock.repository.js";


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


function normalizePositiveQuantity(
    quantity
) {
    const normalized =
        Number(quantity);

    if (
        !Number.isFinite(normalized) ||
        normalized <= 0
    ) {
        throw new Error(
            "Quantity must be greater than 0"
        );
    }

    return normalized;
}


function normalizePositiveInteger(
    value,
    fieldName
) {
    const normalized =
        Number(value);

    if (
        !Number.isInteger(normalized) ||
        normalized < 1
    ) {
        throw new Error(
            `${fieldName} must be a positive integer`
        );
    }

    return normalized;
}


function normalizeOptionalPositiveInteger(
    value,
    fieldName
) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    return normalizePositiveInteger(
        value,
        fieldName
    );
}


function normalizeSearch(search) {
    if (
        search === undefined ||
        search === null
    ) {
        return "";
    }

    return String(search).trim();
}


function normalizeSortBy(sortBy) {
    const allowedSortFields = [
        "id",
        "sku",
        "godown",
        "rack",
        "quantity",
        "created_at",
        "updated_at"
    ];

    if (
        sortBy === undefined ||
        sortBy === null ||
        sortBy === ""
    ) {
        return "sku";
    }

    const normalized =
        String(sortBy).trim();

    if (
        !allowedSortFields.includes(
            normalized
        )
    ) {
        throw new Error(
            `Invalid sort field. Allowed values: ${allowedSortFields.join(", ")}`
        );
    }

    return normalized;
}


function normalizeSortOrder(
    sortOrder
) {
    if (
        sortOrder === undefined ||
        sortOrder === null ||
        sortOrder === ""
    ) {
        return "asc";
    }

    const normalized =
        String(sortOrder)
            .trim()
            .toLowerCase();

    if (
        normalized !== "asc" &&
        normalized !== "desc"
    ) {
        throw new Error(
            'Sort order must be "asc" or "desc"'
        );
    }

    return normalized;
}


async function validateSku(
    sku,
    connection
) {
    const [rows] =
        await connection.query(
            `
            SELECT
                sku_name
            FROM sku_details
            WHERE sku_name = ?
              AND is_active = TRUE
            LIMIT 1
            `,
            [sku]
        );

    if (rows.length === 0) {
        throw new Error(
            `SKU "${sku}" does not exist or is inactive`
        );
    }
}


async function validateGodown(
    godownId,
    connection
) {
    const normalizedId =
        Number(godownId);

    if (
        !Number.isInteger(
            normalizedId
        ) ||
        normalizedId < 1
    ) {
        throw new Error(
            "Invalid Godown"
        );
    }

    const [rows] =
        await connection.query(
            `
            SELECT
                id
            FROM godowns
            WHERE id = ?
              AND is_active = TRUE
            LIMIT 1
            `,
            [normalizedId]
        );

    if (rows.length === 0) {
        throw new Error(
            "Godown does not exist or is inactive"
        );
    }

    return normalizedId;
}


async function validateRack(
    rackId,
    godownId,
    connection
) {
    const normalizedRackId =
        Number(rackId);

    if (
        !Number.isInteger(
            normalizedRackId
        ) ||
        normalizedRackId < 1
    ) {
        throw new Error(
            "Invalid Rack"
        );
    }

    const [rows] =
        await connection.query(
            `
            SELECT
                id,
                godown_id
            FROM racks
            WHERE id = ?
              AND is_active = TRUE
            LIMIT 1
            `,
            [normalizedRackId]
        );

    if (rows.length === 0) {
        throw new Error(
            "Rack does not exist or is inactive"
        );
    }

    if (
        Number(rows[0].godown_id) !==
        Number(godownId)
    ) {
        throw new Error(
            "Rack does not belong to the selected Godown"
        );
    }

    return normalizedRackId;
}


/*
 * Applies one stock movement.
 *
 * This function remains unchanged in
 * behavior for individual callers.
 */
export async function applyStockMovement({
    sku,
    godownId,
    rackId,
    quantity,
    movementType,
    connection
}) {
    if (!connection) {
        throw new Error(
            "Database connection is required for stock movement"
        );
    }

    const normalizedSku =
        normalizeSku(sku);

    const normalizedQuantity =
        normalizePositiveQuantity(
            quantity
        );

    const normalizedMovementType =
        typeof movementType === "string"
            ? movementType
                  .trim()
                  .toLowerCase()
            : "";

    if (
        normalizedMovementType !==
            "in" &&
        normalizedMovementType !==
            "out"
    ) {
        throw new Error(
            'Movement type must be "In" or "Out"'
        );
    }

    const normalizedGodownId =
        await validateGodown(
            godownId,
            connection
        );

    const normalizedRackId =
        await validateRack(
            rackId,
            normalizedGodownId,
            connection
        );

    await validateSku(
        normalizedSku,
        connection
    );

    const [stockRows] =
        await connection.query(
            `
            SELECT
                id,
                sku,
                godown_id,
                rack_id,
                quantity
            FROM stock
            WHERE sku = ?
              AND godown_id = ?
              AND rack_id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [
                normalizedSku,
                normalizedGodownId,
                normalizedRackId
            ]
        );

    const existingStock =
        stockRows.length > 0
            ? stockRows[0]
            : null;

    if (
        normalizedMovementType ===
        "in"
    ) {
        if (existingStock) {
            await incrementStock({
                stockId:
                    existingStock.id,
                quantity:
                    normalizedQuantity,
                connection
            });
        } else {
            await insertStock({
                sku:
                    normalizedSku,
                godownId:
                    normalizedGodownId,
                rackId:
                    normalizedRackId,
                quantity:
                    normalizedQuantity,
                connection
            });
        }
    } else {
        if (!existingStock) {
            throw new Error(
                `Insufficient stock for SKU "${normalizedSku}". Please check whether the incoming stock details were missed.`
            );
        }

        const availableQuantity =
            Number(
                existingStock.quantity
            );

        if (
            availableQuantity <
            normalizedQuantity
        ) {
            throw new Error(
                `Insufficient stock for SKU "${normalizedSku}". Available: ${availableQuantity}, requested: ${normalizedQuantity}. Please check whether the incoming stock details were missed.`
            );
        }

        const affectedRows =
            await decrementStock({
                stockId:
                    existingStock.id,
                quantity:
                    normalizedQuantity,
                connection
            });

        if (
            affectedRows !== 1
        ) {
            throw new Error(
                `Unable to reduce stock for SKU "${normalizedSku}"`
            );
        }
    }

    const updatedStock =
        await getStockRow({
            sku:
                normalizedSku,
            godownId:
                normalizedGodownId,
            rackId:
                normalizedRackId,
            connection
        });

    return {
        sku:
            normalizedSku,
        godownId:
            normalizedGodownId,
        rackId:
            normalizedRackId,
        movementType:
            normalizedMovementType ===
            "in"
                ? "In"
                : "Out",
        quantity:
            normalizedQuantity,
        stockQuantity:
            updatedStock
                ? Number(
                      updatedStock.quantity
                  )
                : 0
    };
}


/*
 * Applies multiple stock movements while
 * preserving the exact order-sensitive
 * behavior of individual movements.
 *
 * IMPORTANT:
 *
 * We do NOT simply calculate:
 *
 *     total IN - total OUT
 *
 * before checking stock.
 *
 * Every movement is simulated in its
 * original order against the evolving
 * quantity for that exact SKU +
 * Godown + Rack location.
 *
 * This prevents an OUT from being
 * accidentally bypassed by a later IN.
 */
export async function applyStockMovements({
    movements,
    connection
}) {
    if (!connection) {
        throw new Error(
            "Database connection is required for stock movement"
        );
    }

    if (
        !Array.isArray(movements) ||
        movements.length === 0
    ) {
        return [];
    }

    /*
     * Normalize everything before making
     * any database mutation.
     */
    const normalizedMovements =
        movements.map(
            (movement) => {
                if (
                    !movement ||
                    typeof movement !==
                        "object" ||
                    Array.isArray(
                        movement
                    )
                ) {
                    throw new Error(
                        "Invalid stock movement item"
                    );
                }

                const sku =
                    normalizeSku(
                        movement.sku
                    );

                const quantity =
                    normalizePositiveQuantity(
                        movement.quantity
                    );

                const godownId =
                    normalizePositiveInteger(
                        movement.godownId,
                        "Godown ID"
                    );

                const rackId =
                    normalizePositiveInteger(
                        movement.rackId,
                        "Rack ID"
                    );

                return {
                    sku,
                    godownId,
                    rackId,
                    quantity,
                    movementType:
                        movement.movementType
                            .trim()
                            .toLowerCase()
                };
            }
        );

    const invalidMovement =
        normalizedMovements.find(
            (movement) =>
                movement.movementType !==
                    "in" &&
                movement.movementType !==
                    "out"
        );

    if (invalidMovement) {
        throw new Error(
            'Movement type must be "In" or "Out"'
        );
    }

    /*
     * Validate each unique master value
     * with one query per master.
     */
    const uniqueSkus =
        [
            ...new Set(
                normalizedMovements.map(
                    (movement) =>
                        movement.sku
                )
            )
        ];

    const uniqueGodownIds =
        [
            ...new Set(
                normalizedMovements.map(
                    (movement) =>
                        movement.godownId
                )
            )
        ];

    const uniqueRackIds =
        [
            ...new Set(
                normalizedMovements.map(
                    (movement) =>
                        movement.rackId
                )
            )
        ];

    const [
        activeSkus,
        activeGodowns,
        activeRacks
    ] = await Promise.all([
        getActiveSkus({
            skus:
                uniqueSkus,
            connection
        }),

        getActiveGodowns({
            godownIds:
                uniqueGodownIds,
            connection
        }),

        getActiveRacks({
            rackIds:
                uniqueRackIds,
            connection
        })
    ]);

    const activeSkuSet =
        new Set(
            activeSkus.map(
                (row) =>
                    row.sku_name
            )
        );

    const activeGodownSet =
        new Set(
            activeGodowns.map(
                (row) =>
                    Number(row.id)
            )
        );

    const rackGodownMap =
        new Map(
            activeRacks.map(
                (row) => [
                    Number(row.id),
                    Number(
                        row.godown_id
                    )
                ]
            )
        );

    /*
     * Validate every movement against
     * the batch lookup results.
     */
    normalizedMovements.forEach(
        (movement) => {
            if (
                !activeSkuSet.has(
                    movement.sku
                )
            ) {
                throw new Error(
                    `SKU "${movement.sku}" does not exist or is inactive`
                );
            }

            if (
                !activeGodownSet.has(
                    movement.godownId
                )
            ) {
                throw new Error(
                    "Godown does not exist or is inactive"
                );
            }

            if (
                !rackGodownMap.has(
                    movement.rackId
                )
            ) {
                throw new Error(
                    "Rack does not exist or is inactive"
                );
            }

            if (
                rackGodownMap.get(
                    movement.rackId
                ) !==
                movement.godownId
            ) {
                throw new Error(
                    "Rack does not belong to the selected Godown"
                );
            }
        }
    );

    /*
     * Fetch all existing stock rows once
     * and lock them for the duration of
     * the surrounding workflow transaction.
     */
    const existingStockRows =
        await getStockRowsForMovements({
            movements:
                normalizedMovements,
            connection
        });

    const stockMap =
        new Map();

    existingStockRows.forEach(
        (row) => {
            const key =
                `${row.sku}\u0000${Number(row.godown_id)}\u0000${Number(row.rack_id)}`;

            stockMap.set(
                key,
                {
                    id:
                        Number(row.id),
                    sku:
                        row.sku,
                    godownId:
                        Number(
                            row.godown_id
                        ),
                    rackId:
                        Number(
                            row.rack_id
                        ),
                    initialQuantity:
                        Number(
                            row.quantity
                        ),
                    quantity:
                        Number(
                            row.quantity
                        ),
                    existed:
                        true
                }
            );
        }
    );

    /*
     * Track locations that do not yet have
     * a stock row as well.
     *
     * We create a zero starting balance
     * in memory. An OUT against it fails
     * exactly as it does in the existing
     * single-row implementation.
     */
    const affectedLocations =
        new Map();

    normalizedMovements.forEach(
        (movement) => {
            const key =
                `${movement.sku}\u0000${movement.godownId}\u0000${movement.rackId}`;

            if (
                !affectedLocations.has(
                    key
                )
            ) {
                const existing =
                    stockMap.get(key);

                affectedLocations.set(
                    key,
                    existing || {
                        id: null,
                        sku:
                            movement.sku,
                        godownId:
                            movement.godownId,
                        rackId:
                            movement.rackId,
                        initialQuantity:
                            0,
                        quantity:
                            0,
                        existed:
                            false
                    }
                );
            }
        }
    );

    /*
     * IMPORTANT:
     *
     * Simulate movements in their
     * original input order.
     *
     * This is what prevents aggregation
     * from bypassing insufficient-stock
     * checks.
     */
    normalizedMovements.forEach(
        (movement) => {
            const key =
                `${movement.sku}\u0000${movement.godownId}\u0000${movement.rackId}`;

            const location =
                affectedLocations.get(
                    key
                );

            if (
                movement.movementType ===
                "in"
            ) {
                location.quantity +=
                    movement.quantity;

                return;
            }

            if (
                location.quantity <
                movement.quantity
            ) {
                if (
                    location.quantity <=
                    0
                ) {
                    throw new Error(
                        `Insufficient stock for SKU "${movement.sku}". Please check whether the incoming stock details were missed.`
                    );
                }

                throw new Error(
                    `Insufficient stock for SKU "${movement.sku}". Available: ${location.quantity}, requested: ${movement.quantity}. Please check whether the incoming stock details were missed.`
                );
            }

            location.quantity -=
                movement.quantity;
        }
    );

    /*
     * Split final locations into existing
     * rows and genuinely new rows.
     */
    const rowsToUpdate = [];
    const rowsToInsert = [];

    affectedLocations.forEach(
        (location) => {
            if (location.existed) {
                rowsToUpdate.push({
                    id:
                        location.id,
                    quantity:
                        location.quantity
                });

                return;
            }

            /*
             * A new row can reach this point
             * only after at least one IN has
             * succeeded in the simulation.
             *
             * We intentionally insert a zero
             * row if the sequence ended at
             * zero, matching the existing
             * implementation:
             *
             *   IN 10
             *   OUT 10
             *
             * creates the stock row and
             * leaves quantity at zero.
             */
            rowsToInsert.push({
                sku:
                    location.sku,
                godownId:
                    location.godownId,
                rackId:
                    location.rackId,
                quantity:
                    location.quantity
            });
        }
    );

    /*
     * No database mutation occurs until
     * every validation and every
     * insufficient-stock check above
     * has passed.
     */
    await updateStockQuantitiesBatch({
        rows:
            rowsToUpdate,
        connection
    });

    await insertStockBatch({
        rows:
            rowsToInsert,
        connection
    });

    /*
     * Return one result per original
     * movement, preserving the API shape
     * conceptually used by the existing
     * single-movement operation.
     *
     * We do not perform another SELECT
     * for every row.
     */
    return normalizedMovements.map(
        (movement) => {
            const key =
                `${movement.sku}\u0000${movement.godownId}\u0000${movement.rackId}`;

            const location =
                affectedLocations.get(
                    key
                );

            return {
                sku:
                    movement.sku,
                godownId:
                    movement.godownId,
                rackId:
                    movement.rackId,
                movementType:
                    movement.movementType ===
                    "in"
                        ? "In"
                        : "Out",
                quantity:
                    movement.quantity,
                stockQuantity:
                    location.quantity
            };
        }
    );
}


/*
 * Returns paginated stock with
 * search, filters and sorting.
 */
export async function getStockList({
    search,
    sku,
    godownId,
    rackId,
    page,
    limit,
    sortBy,
    sortOrder
} = {}) {
    const normalizedSearch =
        normalizeSearch(search);

    const normalizedSku =
        sku === undefined ||
        sku === null ||
        sku === ""
            ? null
            : normalizeSku(sku);

    const normalizedGodownId =
        normalizeOptionalPositiveInteger(
            godownId,
            "Godown ID"
        );

    const normalizedRackId =
        normalizeOptionalPositiveInteger(
            rackId,
            "Rack ID"
        );

    const normalizedPage =
        page === undefined ||
        page === null ||
        page === ""
            ? 1
            : normalizePositiveInteger(
                  page,
                  "Page"
              );

    const normalizedLimit =
        limit === undefined ||
        limit === null ||
        limit === ""
            ? 20
            : normalizePositiveInteger(
                  limit,
                  "Limit"
              );

    if (
        normalizedLimit > 100
    ) {
        throw new Error(
            "Limit cannot be greater than 100"
        );
    }

    const normalizedSortBy =
        normalizeSortBy(sortBy);

    const normalizedSortOrder =
        normalizeSortOrder(
            sortOrder
        );

    return await getPaginatedStockList({
        search:
            normalizedSearch,
        sku:
            normalizedSku,
        godownId:
            normalizedGodownId,
        rackId:
            normalizedRackId,
        page:
            normalizedPage,
        limit:
            normalizedLimit,
        sortBy:
            normalizedSortBy,
        sortOrder:
            normalizedSortOrder
    });
}


export async function getStockSummaryService() {
    return getStockSummary();
}