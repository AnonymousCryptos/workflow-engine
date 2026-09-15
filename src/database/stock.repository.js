import { getPool } from "../config/database.js";

/*
 * Finds a stock row for an exact
 * SKU + Godown + Rack combination.
 *
 * connection is optional so this can
 * be used both inside and outside a
 * transaction.
 */
export async function getStockRow({
    sku,
    godownId,
    rackId,
    connection = null
}) {
    const db =
        connection || getPool();

    const [rows] =
        await db.query(
            `
            SELECT
                id,
                sku,
                godown_id,
                rack_id,
                quantity,
                created_at,
                updated_at
            FROM stock
            WHERE sku = ?
              AND godown_id = ?
              AND rack_id = ?
            LIMIT 1
            `,
            [
                sku,
                godownId,
                rackId
            ]
        );

    return rows.length > 0
        ? rows[0]
        : null;
}

/*
 * Returns paginated stock with
 * search, filters and sorting.
 *
 * All sortable columns are explicitly
 * allowlisted before being used in SQL.
 */
export async function getStockList({
    search = "",
    sku = null,
    godownId = null,
    rackId = null,
    page = 1,
    limit = 20,
    sortBy = "sku",
    sortOrder = "asc"
}) {
    const pool = getPool();

    const conditions = [];
    const params = [];

    if (search) {
        conditions.push(`
            (
                s.sku LIKE ?
                OR g.name LIKE ?
                OR r.name LIKE ?
            )
        `);

        const searchValue =
            `%${search}%`;

        params.push(
            searchValue,
            searchValue,
            searchValue
        );
    }

    if (sku !== null) {
        conditions.push(
            "s.sku = ?"
        );

        params.push(sku);
    }

    if (godownId !== null) {
        conditions.push(
            "s.godown_id = ?"
        );

        params.push(godownId);
    }

    if (rackId !== null) {
        conditions.push(
            "s.rack_id = ?"
        );

        params.push(rackId);
    }

    const whereClause =
        conditions.length > 0
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

    const sortableColumns = {
        id: "s.id",
        sku: "s.sku",
        godown: "g.name",
        rack: "r.name",
        quantity: "s.quantity",
        created_at: "s.created_at",
        updated_at: "s.updated_at"
    };

    const orderColumn =
        sortableColumns[sortBy] ||
        sortableColumns.sku;

    const orderDirection =
        sortOrder === "desc"
            ? "DESC"
            : "ASC";

    const offset =
        (page - 1) * limit;

    const [countRows] =
        await pool.query(
            `
            SELECT
                COUNT(*) AS total
            FROM stock s
            INNER JOIN godowns g
                ON g.id = s.godown_id
            INNER JOIN racks r
                ON r.id = s.rack_id
            ${whereClause}
            `,
            params
        );

    const total =
        Number(countRows[0].total);

    const [rows] =
        await pool.query(
            `
            SELECT
                s.id,
                s.sku,
                s.godown_id,
                g.name AS godown_name,
                s.rack_id,
                r.name AS rack_name,
                s.quantity,
                s.created_at,
                s.updated_at
            FROM stock s
            INNER JOIN godowns g
                ON g.id = s.godown_id
            INNER JOIN racks r
                ON r.id = s.rack_id
            ${whereClause}
            ORDER BY
                ${orderColumn} ${orderDirection},
                s.id ASC
            LIMIT ?
            OFFSET ?
            `,
            [
                ...params,
                limit,
                offset
            ]
        );

    return {
        rows,
        total
    };
}


/*
 * Inserts a new stock location.
 */
export async function insertStock({
    sku,
    godownId,
    rackId,
    quantity,
    connection
}) {
    if (!connection) {
        throw new Error(
            "Database connection is required for stock mutations"
        );
    }

    const [result] =
        await connection.query(
            `
            INSERT INTO stock
            (
                sku,
                godown_id,
                rack_id,
                quantity
            )
            VALUES (?, ?, ?, ?)
            `,
            [
                sku,
                godownId,
                rackId,
                quantity
            ]
        );

    return result.insertId;
}


/*
 * Increments an existing stock row.
 */
export async function incrementStock({
    stockId,
    quantity,
    connection
}) {
    if (!connection) {
        throw new Error(
            "Database connection is required for stock mutations"
        );
    }

    const [result] =
        await connection.query(
            `
            UPDATE stock
            SET quantity = quantity + ?
            WHERE id = ?
            `,
            [
                quantity,
                stockId
            ]
        );

    return result.affectedRows;
}


/*
 * Decrements an existing stock row.
 *
 * The quantity check is intentionally
 * performed in SQL as well so the update
 * cannot reduce stock below zero.
 */
export async function decrementStock({
    stockId,
    quantity,
    connection
}) {
    if (!connection) {
        throw new Error(
            "Database connection is required for stock mutations"
        );
    }

    const [result] =
        await connection.query(
            `
            UPDATE stock
            SET quantity = quantity - ?
            WHERE id = ?
              AND quantity >= ?
            `,
            [
                quantity,
                stockId,
                quantity
            ]
        );

    return result.affectedRows;
}

export async function getStockSummary() {
    const pool = getPool();

    const [rows] = await pool.query(
        `
        SELECT
            COUNT(DISTINCT sku) AS total_skus,
            COALESCE(
                SUM(quantity),
                0
            ) AS total_stock_quantity,
            COUNT(
                DISTINCT godown_id
            ) AS total_godowns,
            COUNT(
                DISTINCT CONCAT(
                    godown_id,
                    '-',
                    rack_id
                )
            ) AS total_locations
        FROM stock
        WHERE quantity > 0
        `
    );

    return {
        totalSkus:
            Number(
                rows[0].total_skus
            ),

        totalStockQuantity:
            Number(
                rows[0].total_stock_quantity
            ),

        totalGodowns:
            Number(
                rows[0].total_godowns
            ),

        totalLocations:
            Number(
                rows[0].total_locations
            )
    };
}
