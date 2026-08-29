import { getPool } from "../config/database.js";
import bcrypt from "bcryptjs";

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

const FIELD_TRANSFORMS = {
    hash: async (value) => {
        if (
            typeof value !== "string" ||
            value.length === 0
        ) {
            throw new Error(
                "Password must be a non-empty string"
            );
        }

        return bcrypt.hash(
            value,
            10
        );
    }
};

export async function createAdminRow(
    tableName,
    data,
    tableConfig = {}
) {
    const pool = getPool();

    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        throw new Error(
            "Request body must be an object"
        );
    }

    const writableFields =
        tableConfig.writableFields || {};

    if (
        Object.keys(writableFields).length === 0
    ) {
        throw new Error(
            "No writable fields configured for this table"
        );
    }

    const [columns] =
        await pool.query(
            `
            SELECT
                COLUMN_NAME AS name,
                DATA_TYPE AS dataType,
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

    if (columns.length === 0) {
        throw new Error(
            "Admin table not found"
        );
    }

    const columnMap =
        new Map(
            columns.map(
                (column) => [
                    column.name,
                    column
                ]
            )
        );

    const inputFields =
        Object.keys(data);

    if (inputFields.length === 0) {
        throw new Error(
            "At least one field is required"
        );
    }

    const insertData = {};

    for (
        const fieldName of inputFields
    ) {
        const fieldConfig =
            writableFields[fieldName];

        if (!fieldConfig) {
            throw new Error(
                `${fieldName} cannot be set`
            );
        }

        const columnName =
            fieldConfig.column ||
            fieldName;

        if (
            !columnMap.has(columnName)
        ) {
            throw new Error(
                `Configured database field ${columnName} does not exist`
            );
        }

        const column =
            columnMap.get(columnName);

        if (
            tableConfig.immutableColumns?.includes(
                columnName
            )
        ) {
            throw new Error(
                `${columnName} cannot be set`
            );
        }

        let value =
            data[fieldName];

        if (
            fieldConfig.transform
        ) {
            const transform =
                FIELD_TRANSFORMS[
                    fieldConfig.transform
                ];

            if (!transform) {
                throw new Error(
                    `Unsupported field transformation: ${fieldConfig.transform}`
                );
            }

            value =
                await transform(value);
        }

        if (
            value === undefined
        ) {
            throw new Error(
                `${fieldName} cannot be undefined`
            );
        }

        insertData[columnName] =
            value;
    }

    /*
     * Validate required database
     * columns that have no default.
     */
    for (
        const column of columns
    ) {
        if (
            column.extra.includes(
                "auto_increment"
            )
        ) {
            continue;
        }

        if (
            column.nullable === "NO" &&
            column.defaultValue === null &&
            !Object.prototype.hasOwnProperty.call(
                insertData,
                column.name
            )
        ) {
            throw new Error(
                `${column.name} is required`
            );
        }
    }

    const insertColumns =
        Object.keys(insertData);

    const escapedColumns =
        insertColumns
            .map(
                (column) =>
                    `\`${column}\``
            )
            .join(", ");

    const placeholders =
        insertColumns
            .map(() => "?")
            .join(", ");

    const values =
        insertColumns.map(
            (column) =>
                insertData[column]
        );

    const [result] =
        await pool.query(
            `
            INSERT INTO \`${tableName}\`
            (${escapedColumns})
            VALUES (${placeholders})
            `,
            values
        );

    return {
        id: result.insertId
    };
}
