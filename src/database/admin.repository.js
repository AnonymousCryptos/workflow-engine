import { getPool } from "../config/database.js";
import { MASTER_CONFIG } from "../config/master-tables.js";
import bcrypt from "bcryptjs";

const STRING_DATA_TYPES = [
    "char",
    "varchar",
    "text",
    "tinytext",
    "mediumtext",
    "longtext"
];

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
    tableConfig = {},
    sortBy = "id",
    sortOrder = "desc"
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

    /*
     * Sorting is restricted to actual
     * database columns.
     *
     * This prevents arbitrary SQL from
     * being supplied through sortBy.
     */
    const sortableColumn =
        columns.find(
            (column) =>
                column.name === sortBy
        );

    if (!sortableColumn) {
        throw new Error(
            "Invalid sort column"
        );
    }

    const normalizedSortOrder =
        String(sortOrder).toLowerCase() ===
        "asc"
            ? "ASC"
            : "DESC";

    const escapedSortColumn =
        `\`${sortableColumn.name}\``;

    const searchableColumns =
        visibleColumns.filter(
            (column) =>
                STRING_DATA_TYPES.includes(
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
            ORDER BY ${escapedSortColumn} ${normalizedSortOrder}
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

function normalizeAdminFieldValue(
    value,
    column
) {
    if (
        value === null ||
        value === undefined
    ) {
        return value;
    }

    if (
        STRING_DATA_TYPES.includes(
            column.dataType
        )
    ) {
        return String(value);
    }

    return value;
}

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

    const uniqueFields =
        tableConfig.uniqueFields || [];

    for (
        const fieldName of uniqueFields
    ) {
        const fieldConfig =
            writableFields[fieldName];

        if (!fieldConfig) {
            throw new Error(
                `Configured unique field ${fieldName} is not writable`
            );
        }

        const columnName =
            fieldConfig.column ||
            fieldName;

        if (!columnMap.has(columnName)) {
            throw new Error(
                `Configured unique database field ${columnName} does not exist`
            );
        }
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

        const isMissing =
            value === null ||
            value === undefined ||
            value === "";

        const isRequired =
            (tableConfig.requiredFields || [])
                .includes(fieldName);

        if (isMissing) {
            if (isRequired) {
                throw new Error(
                    `${fieldName} is required`
                );
            }

            /*
             * Optional empty fields are omitted
             * from the INSERT so the database
             * default can be applied.
             */
            continue;
        }

        /*
         * Normalize values according to the
         * actual database datatype.
         *
         * Excel may provide a numeric value for
         * a string column. For example:
         *
         *     12345678
         *
         * becomes:
         *
         *     "12345678"
         *
         * This is especially important for
         * numeric-only passwords.
         */
        value =
            normalizeAdminFieldValue(
                value,
                column
            );

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

        insertData[columnName] =
            value;
    }

    for (
        const fieldName of uniqueFields
    ) {
        const columnName =
            writableFields[fieldName].column ||
            fieldName;

        if (
            !Object.prototype.hasOwnProperty.call(
                insertData,
                columnName
            )
        ) {
            continue;
        }

        const value =
            insertData[columnName];

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            continue;
        }

        const [existingRows] =
            await pool.query(
                `
                SELECT 1
                FROM \`${tableName}\`
                WHERE \`${columnName}\` = ?
                LIMIT 1
                `,
                [value]
            );

        if (existingRows.length > 0) {
            throw new Error(
                `${fieldName} already exists. Use a different value.`
            );
        }
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

    /*
     * Final defensive cleanup.
     *
     * Optional null/undefined/empty values
     * must never be explicitly inserted.
     */
    for (
        const columnName of
            Object.keys(insertData)
    ) {
        const value =
            insertData[columnName];

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            delete insertData[
                columnName
            ];
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

export async function validateAdminRows(
    tableName,
    rows,
    tableConfig = {}
) {
    const pool = getPool();

    if (!Array.isArray(rows)) {
        throw new Error(
            "Excel data must contain rows"
        );
    }

    if (rows.length === 0) {
        throw new Error(
            "Excel file does not contain any data rows"
        );
    }

    const writableFields =
        tableConfig.writableFields || {};

    const writableFieldNames =
        Object.keys(writableFields);

    if (
        writableFieldNames.length === 0
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

    /*
     * Validate configured writable fields
     * against actual database columns.
     */
    for (
        const fieldName of
            writableFieldNames
    ) {
        const fieldConfig =
            writableFields[fieldName];

        const columnName =
            fieldConfig.column ||
            fieldName;

        if (!columnMap.has(columnName)) {
            throw new Error(
                `Configured database field ${columnName} does not exist`
            );
        }

        if (
            tableConfig.immutableColumns?.includes(
                columnName
            )
        ) {
            throw new Error(
                `${columnName} cannot be configured as writable`
            );
        }
    }

    /*
     * Excel headers.
     */
    const actualHeaders =
        Object.keys(rows[0]);

    const unknownHeaders =
        actualHeaders.filter(
            (header) =>
                !writableFieldNames.includes(
                    header
                )
        );

    if (unknownHeaders.length > 0) {
        throw new Error(
            `Unknown column(s): ${unknownHeaders.join(
                ", "
            )}`
        );
    }

    /*
     * Required fields are explicitly
     * configured in admin-tables.js.
     */
    const requiredFields =
        tableConfig.requiredFields || [];

    /*
     * Check that configured required
     * fields are also writable.
     */
    for (
        const fieldName of
            requiredFields
    ) {
        if (
            !writableFields[fieldName]
        ) {
            throw new Error(
                `Configured required field ${fieldName} is not writable`
            );
        }
    }

    /*
     * Check required Excel headers.
     */
    const requiredMissingHeaders =
        requiredFields.filter(
            (fieldName) =>
                !actualHeaders.includes(
                    fieldName
                )
        );

    if (
        requiredMissingHeaders.length > 0
    ) {
        throw new Error(
            `Required column(s) missing: ${requiredMissingHeaders.join(
                ", "
            )}`
        );
    }

    /*
     * Load lookup values used by this table.
     *
     * Lookup validation is driven entirely
     * by admin-tables.js and master-tables.js.
     */
    const lookupValues =
        new Map();

    const lookupFields =
        writableFieldNames.filter(
            (fieldName) =>
                writableFields[fieldName]?.lookup
        );

    const lookupMasters =
        [
            ...new Set(
                lookupFields.map(
                    (fieldName) =>
                        writableFields[
                            fieldName
                        ].lookup
                )
            )
        ];

    for (
        const master of lookupMasters
    ) {
        const masterConfig =
            MASTER_CONFIG[master];

        if (!masterConfig) {
            throw new Error(
                `Unknown lookup master: ${master}`
            );
        }

        /*
         * If the master has an idField,
         * validate against that ID.
         * Otherwise validate against
         * the configured valueField.
         */
        const lookupField =
            masterConfig.idField ||
            masterConfig.valueField;

        const [lookupRows] =
            await pool.query(
                `
                SELECT
                    ${lookupField} AS value
                FROM ${masterConfig.table}
                WHERE is_active = 1
                `
            );

        lookupValues.set(
            master,
            new Set(
                lookupRows.map(
                    (lookupRow) =>
                        String(
                            lookupRow.value
                        ).trim()
                )
            )
        );
    }

    /*
     * Configure business-level unique
     * fields.
     */
    const uniqueFields =
        tableConfig.uniqueFields || [];

    const uniqueFieldMappings =
        uniqueFields.map(
            (fieldName) => {
                const fieldConfig =
                    writableFields[
                        fieldName
                    ];

                if (!fieldConfig) {
                    throw new Error(
                        `Configured unique field ${fieldName} is not writable`
                    );
                }

                const columnName =
                    fieldConfig.column ||
                    fieldName;

                if (
                    !columnMap.has(
                        columnName
                    )
                ) {
                    throw new Error(
                        `Configured unique database field ${columnName} does not exist`
                    );
                }

                return {
                    fieldName,
                    columnName
                };
            }
        );

    /*
     * Load existing unique values.
     */
    const existingUniqueValues =
        new Map();

    for (
        const mapping of
            uniqueFieldMappings
    ) {
        const [existingRows] =
            await pool.query(
                `
                SELECT
                    \`${mapping.columnName}\`
                FROM \`${tableName}\`
                WHERE \`${mapping.columnName}\` IS NOT NULL
                `
            );

        existingUniqueValues.set(
            mapping.fieldName,
            new Set(
                existingRows.map(
                    (row) =>
                        normalizeUniqueValue(
                            row[
                                mapping.columnName
                            ]
                        )
                )
            )
        );
    }

    /*
     * Track unique values appearing
     * within this upload.
     */
    const uploadedUniqueValues =
        new Map();

    for (
        const mapping of
            uniqueFieldMappings
    ) {
        uploadedUniqueValues.set(
            mapping.fieldName,
            new Set()
        );
    }

    const validatedRows = [];

    for (
        let index = 0;
        index < rows.length;
        index++
    ) {
        const row = rows[index];

        const errors = [];

        if (
            !row ||
            typeof row !== "object" ||
            Array.isArray(row)
        ) {
            validatedRows.push({
                rowNumber: index + 2,
                data: row,
                valid: false,
                errors: [
                    {
                        field: null,
                        message:
                            "Invalid row data.",
                        suggestion:
                            "Check the row and make sure it contains valid Excel values."
                    }
                ]
            });

            continue;
        }

        /*
         * Create a normalized copy of the row.
         *
         * This is important because the normalized
         * value must also be passed to the later
         * insertion step.
         */
        const normalizedRow = {
            ...row
        };

        /*
         * Validate every configured
         * writable field.
         */
        for (
            const fieldName of
                writableFieldNames
        ) {
            const fieldConfig =
                writableFields[fieldName];

            const columnName =
                fieldConfig.column ||
                fieldName;

            const column =
                columnMap.get(columnName);

            let value =
                row[fieldName];

            const isMissing =
                value === null ||
                value === undefined ||
                value === "";

            /*
             * Required field.
             */
            const isRequired =
                requiredFields.includes(
                    fieldName
                );

            if (
                isMissing &&
                isRequired
            ) {
                errors.push({
                    field: fieldName,
                    message:
                        "Required value is missing.",
                    suggestion:
                        `Provide a value for ${formatFieldName(
                            fieldName
                        )}.`
                });

                continue;
            }

            /*
             * Empty optional/defaulted
             * fields are allowed.
             */
            if (isMissing) {
                continue;
            }

            /*
             * Normalize according to the actual
             * database datatype BEFORE validation.
             *
             * Example:
             *
             * Excel:
             *     12345678
             *
             * MySQL VARCHAR:
             *     "12345678"
             */
            value =
                normalizeAdminFieldValue(
                    value,
                    column
                );

            normalizedRow[fieldName] =
                value;

            /*
             * Validate lookup value.
             *
             * The lookup configuration determines
             * which master table must contain the
             * supplied value.
             */
            if (fieldConfig.lookup) {
                const validLookupValues =
                    lookupValues.get(
                        fieldConfig.lookup
                    );

                if (
                    validLookupValues &&
                    !validLookupValues.has(
                        String(value).trim()
                    )
                ) {
                    errors.push({
                        field: fieldName,
                        message:
                            "Referenced value does not exist or is inactive.",
                        suggestion:
                            `Provide a valid active ${formatFieldName(
                                fieldConfig.lookup
                            ).toLowerCase()} value.`
                    });
                }
            }

            /*
             * Validate datatype.
             */
            const validationError =
                validateAdminFieldValue(
                    fieldName,
                    value,
                    column,
                    fieldConfig
                );

            if (validationError) {
                errors.push(
                    validationError
                );
            }

            /*
             * Validate uniqueness.
             */
            const uniqueSet =
                existingUniqueValues.get(
                    fieldName
                );

            const uploadedSet =
                uploadedUniqueValues.get(
                    fieldName
                );

            if (
                uniqueSet &&
                !isMissing
            ) {
                const normalized =
                    normalizeUniqueValue(
                        value
                    );

                if (
                    uniqueSet.has(
                        normalized
                    )
                ) {
                    errors.push({
                        field: fieldName,
                        message:
                            "Value already exists.",
                        suggestion:
                            `Use a different ${formatFieldName(
                                fieldName
                            ).toLowerCase()}.`
                    });
                }

                if (
                    uploadedSet.has(
                        normalized
                    )
                ) {
                    errors.push({
                        field: fieldName,
                        message:
                            "Duplicate value appears more than once in this upload.",
                        suggestion:
                            `Use a different ${formatFieldName(
                                fieldName
                            ).toLowerCase()}.`
                    });
                }

                uploadedSet.add(
                    normalized
                );
            }
        }

        validatedRows.push({
            rowNumber: index + 2,

            /*
             * Store normalized data so that when
             * valid rows are inserted later, the
             * same normalized values are used.
             */
            data: normalizedRow,

            valid: errors.length === 0,
            errors
        });
    }

    const validRows =
        validatedRows.filter(
            (row) => row.valid
        ).length;

    const invalidRows =
        validatedRows.length -
        validRows;

    return {
        totalRows: rows.length,
        validRows,
        invalidRows,
        rows: validatedRows
    };
}

function validateAdminFieldValue(
    fieldName,
    value,
    column,
    fieldConfig = {}
) {
    /*
     * Password is validated as the
     * source value. Hashing happens only
     * during actual insertion.
     *
     * String normalization has already
     * happened before this function, so a
     * numeric-only Excel password is now
     * a string.
     */
    if (
        fieldConfig.transform ===
        "hash"
    ) {
        if (
            typeof value !== "string" ||
            value.trim().length === 0
        ) {
            return {
                field: fieldName,
                message:
                    "Password must be a non-empty value.",
                suggestion:
                    "Provide a password."
            };
        }

        return null;
    }

    switch (column.dataType) {
        case "tinyint":
        case "smallint":
        case "mediumint":
        case "int":
        case "bigint":
            if (
                typeof value === "number" &&
                Number.isInteger(value)
            ) {
                return null;
            }

            if (
                typeof value === "string" &&
                /^-?\d+$/.test(
                    value.trim()
                )
            ) {
                return null;
            }

            return {
                field: fieldName,
                message:
                    "Value must be a valid integer.",
                suggestion:
                    "Enter a whole number such as 0 or 1."
            };

        case "decimal":
        case "float":
        case "double":
            if (
                typeof value === "number" &&
                Number.isFinite(value)
            ) {
                return null;
            }

            if (
                typeof value === "string" &&
                value.trim() !== "" &&
                Number.isFinite(
                    Number(value)
                )
            ) {
                return null;
            }

            return {
                field: fieldName,
                message:
                    "Value must be a valid number.",
                suggestion:
                    "Enter a numeric value."
            };

        case "date":
        case "datetime":
        case "timestamp":
            if (
                value instanceof Date
            ) {
                return null;
            }

            if (
                typeof value === "string"
            ) {
                const parsed =
                    new Date(value);

                if (
                    !Number.isNaN(
                        parsed.getTime()
                    )
                ) {
                    return null;
                }
            }

            if (
                typeof value === "number" &&
                Number.isFinite(value)
            ) {
                return null;
            }

            return {
                field: fieldName,
                message:
                    "Value must be a valid date/time.",
                suggestion:
                    "Use a valid date or date-time value."
            };

        case "char":
        case "varchar":
        case "text":
        case "tinytext":
        case "mediumtext":
        case "longtext":
            /*
             * String fields have already been
             * normalized to strings.
             */
            if (
                typeof value === "string"
            ) {
                return null;
            }

            return {
                field: fieldName,
                message:
                    "Value must be text.",
                suggestion:
                    "Enter a text value."
            };

        default:
            return null;
    }
}

function normalizeUniqueValue(
    value
) {
    return String(value)
        .trim()
        .toLowerCase();
}

function formatFieldName(
    fieldName
) {
    return fieldName
        .replace(/\_/g, " ")
        .replace(
            /\b\w/g,
            (character) =>
                character.toUpperCase()
        );
}

export async function insertValidatedAdminRows(
    tableName,
    rows,
    tableConfig = {}
) {
    const pool = getPool();

    if (!Array.isArray(rows)) {
        throw new Error(
            "Validated rows must be an array"
        );
    }

    if (rows.length === 0) {
        throw new Error(
            "No valid rows to insert"
        );
    }

    const connection =
        await pool.getConnection();

    try {
        await connection.beginTransaction();

        const insertedIds = [];

        for (const row of rows) {
            if (!row.valid) {
                throw new Error(
                    `Row ${row.rowNumber} is not valid`
                );
            }

            const result =
                await createAdminRowWithConnection(
                    connection,
                    tableName,
                    row.data,
                    tableConfig
                );

            insertedIds.push({
                rowNumber:
                    row.rowNumber,
                id: result.id
            });
        }

        await connection.commit();

        return {
            insertedCount:
                insertedIds.length,
            insertedIds
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function createAdminRowWithConnection(
    connection,
    tableName,
    data,
    tableConfig = {}
) {
    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        throw new Error(
            "Row data must be an object"
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
        await connection.query(
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

    const requiredFields =
        tableConfig.requiredFields || [];

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

        const column =
            columnMap.get(columnName);

        if (!column) {
            throw new Error(
                `Configured database field ${columnName} does not exist`
            );
        }

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

        const isMissing =
            value === null ||
            value === undefined ||
            value === "";

        const isRequired =
            requiredFields.includes(
                fieldName
            );

        /*
         * Required fields must contain
         * an actual value.
         */
        if (isMissing) {
            if (isRequired) {
                throw new Error(
                    `${fieldName} is required`
                );
            }

            /*
             * Optional empty fields are omitted
             * so the database default can apply.
             */
            continue;
        }

        /*
         * Normalize according to the database
         * datatype before applying transforms.
         */
        value =
            normalizeAdminFieldValue(
                value,
                column
            );

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

        insertData[columnName] =
            value;
    }

    /*
     * Check unique fields again immediately
     * before insertion.
     */
    const uniqueFields =
        tableConfig.uniqueFields || [];

    for (
        const fieldName of uniqueFields
    ) {
        const fieldConfig =
            writableFields[fieldName];

        if (!fieldConfig) {
            throw new Error(
                `Configured unique field ${fieldName} is not writable`
            );
        }

        const columnName =
            fieldConfig.column ||
            fieldName;

        if (
            !Object.prototype.hasOwnProperty.call(
                insertData,
                columnName
            )
        ) {
            continue;
        }

        const value =
            insertData[columnName];

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            continue;
        }

        const [existingRows] =
            await connection.query(
                `
                SELECT 1
                FROM \`${tableName}\`
                WHERE \`${columnName}\` = ?
                LIMIT 1
                `,
                [value]
            );

        if (
            existingRows.length > 0
        ) {
            throw new Error(
                `${fieldName} already exists. Use a different value.`
            );
        }
    }

    /*
     * Validate required database columns
     * that have no default.
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

    /*
     * Final defensive cleanup.
     *
     * Optional null/undefined/empty values
     * must never be explicitly inserted.
     */
    for (
        const columnName of
            Object.keys(insertData)
    ) {
        const value =
            insertData[columnName];

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            delete insertData[
                columnName
            ];
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
        await connection.query(
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