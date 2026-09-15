import { getPool } from "../config/database.js";

import {
    getStockRow,
    getStockList as getPaginatedStockList,
    insertStock,
    incrementStock,
    decrementStock,
    getStockSummary
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
 * This function requires an existing
 * database connection because it is
 * intended to participate in the same
 * transaction as workflow submission.
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
