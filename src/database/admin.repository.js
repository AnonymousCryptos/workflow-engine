import { getPool } from "../config/database.js";

export async function getTableMetadata(
    tableName,
    tableConfig = {}
) {
    const pool = getPool();
    const hiddenColumns =
        tableConfig.hiddenColumns || [];

    const [rows] = await pool.query(
        `
        SELECT
            COLUMN_NAME AS name,
            DATA_TYPE AS dataType,
            COLUMN_TYPE AS columnType,
            IS_NULLABLE AS nullable,
            COLUMN_DEFAULT AS defaultValue,
            COLUMN_KEY AS columnKey,
            EXTRA AS extra
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
        `,
        [tableName]
    );

    return rows.filter(
        (column) =>
            !hiddenColumns.includes(
                column.name
            )
    );
}

export async function getAdminTableRows(
    tableName,
    search = "",
    page = 1,
    limit = 20,
    tableConfig = {}
) {
    const pool = getPool();
    const hiddenColumns =
        tableConfig.hiddenColumns || [];

    const offset =
        (page - 1) * limit;

    const [columns] =
        await pool.query(
            `
            SELECT
                COLUMN_NAME AS name,
                DATA_TYPE AS dataType
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
            `,
            [tableName]
        );

    if (columns.length === 0) {
        throw new Error(
            "Admin table not found"
        );
    }

    const visibleColumns =
        columns.filter(
            (column) =>
                !hiddenColumns.includes(
                    column.name
                )
        );

    const columnNames =
        visibleColumns.map(
            (column) => column.name
        );

    const escapedColumns =
        columnNames
            .map(
                (column) =>
                    `\`${column}\``
            )
            .join(", ");

    const searchableColumns =
        visibleColumns.filter(
            (column) =>
                [
                    "char",
                    "varchar",
                    "text",
                    "tinytext",
                    "mediumtext",
                    "longtext"
                ].includes(
                    column.dataType
                )
        );

    let whereClause = "";
    const queryParams = [];

    if (
        search.trim() !== "" &&
        searchableColumns.length > 0
    ) {
        const conditions =
            searchableColumns.map(
                (column) => {
                    queryParams.push(
                        `%${search.trim()}%`
                    );

                    return `\`${column.name}\` LIKE ?`;
                }
            );

        whereClause =
            `WHERE ${conditions.join(
                " OR "
            )}`;
    }

    const [countRows] =
        await pool.query(
            `
            SELECT COUNT(*) AS total
            FROM \`${tableName}\`
            ${whereClause}
            `,
            queryParams
        );

    const total =
        Number(countRows[0].total);

    const [rows] =
        await pool.query(
            `
            SELECT ${escapedColumns}
            FROM \`${tableName}\`
            ${whereClause}
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            `,
            [
                ...queryParams,
                limit,
                offset
            ]
        );

    return {
        rows,
        pagination: {
            page,
            limit,
            total,
            totalPages:
                Math.ceil(
                    total / limit
                )
        }
    };
}
