import { getPool } from "../config/database.js";
import { MASTER_CONFIG } from "../config/master-tables.js";

const INTEGER_DATA_TYPES = [
    "integer",
    "int",
    "bigint"
];

const NUMBER_DATA_TYPES = [
    "number",
    "decimal",
    "float",
    "double"
];

const BOOLEAN_TRUE_VALUES = [
    "true",
    "yes",
    "1"
];

const BOOLEAN_FALSE_VALUES = [
    "false",
    "no",
    "0"
];

function isMissing(value) {
    return (
        value === null ||
        value === undefined ||
        value === ""
    );
}

function normalizeText(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}

function formatFieldName(fieldName) {
    return String(fieldName)
        .replace(/_/g, " ")
        .replace(
            /\b\w/g,
            (character) =>
                character.toUpperCase()
        );
}

function normalizeFieldValue(
    field,
    value
) {
    if (isMissing(value)) {
        return value;
    }

    switch (field.dataType) {
        case "number":
        case "decimal":
        case "float":
        case "double": {
            const numericValue =
                Number(value);

            return Number.isFinite(
                numericValue
            )
                ? numericValue
                : value;
        }

        case "integer":
        case "int":
        case "bigint": {
            if (
                typeof value === "number"
            ) {
                return Number.isInteger(
                    value
                )
                    ? value
                    : value;
            }

            const stringValue =
                String(value).trim();

            if (
                /^-?\d+$/.test(
                    stringValue
                )
            ) {
                return Number(
                    stringValue
                );
            }

            return value;
        }

        case "boolean": {
            if (
                typeof value ===
                "boolean"
            ) {
                return value;
            }

            const normalized =
                String(value)
                    .trim()
                    .toLowerCase();

            if (
                BOOLEAN_TRUE_VALUES.includes(
                    normalized
                )
            ) {
                return true;
            }

            if (
                BOOLEAN_FALSE_VALUES.includes(
                    normalized
                )
            ) {
                return false;
            }

            return value;
        }

        case "string":
        case "char":
        case "varchar":
        case "text":
        case "tinytext":
        case "mediumtext":
        case "longtext":
            return String(value).trim();

        default:
            return value;
    }
}

function validateDataType(
    field,
    value
) {
    if (isMissing(value)) {
        return null;
    }

    if (
        INTEGER_DATA_TYPES.includes(
            field.dataType
        )
    ) {
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
            message:
                "Value must be a valid integer.",
            suggestion:
                "Enter a whole number."
        };
    }

    if (
        NUMBER_DATA_TYPES.includes(
            field.dataType
        )
    ) {
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
            message:
                "Value must be a valid number.",
            suggestion:
                "Enter a numeric value."
        };
    }

    if (
        field.dataType === "boolean"
    ) {
        if (
            typeof value === "boolean"
        ) {
            return null;
        }

        return {
            message:
                "Value must be a valid boolean.",
            suggestion:
                "Use true/false, yes/no, or 1/0."
        };
    }

    if (
        field.dataType === "string" ||
        field.dataType === "char" ||
        field.dataType === "varchar" ||
        field.dataType === "text" ||
        field.dataType === "tinytext" ||
        field.dataType === "mediumtext" ||
        field.dataType === "longtext"
    ) {
        if (
            typeof value === "string"
        ) {
            return null;
        }

        return {
            message:
                "Value must be text.",
            suggestion:
                `Enter a text value for ${formatFieldName(
                    field.key
                )}.`
        };
    }

    return null;
}

async function loadLookupData(
    fields
) {
    const lookupMasters =
        new Set();

    for (const field of fields) {
        if (
            field.lookup?.master
        ) {
            lookupMasters.add(
                field.lookup.master
            );
        }
    }

    const pool = getPool();

    const lookupData =
        new Map();

    for (
        const master of lookupMasters
    ) {
        const config =
            MASTER_CONFIG[master];

        if (!config) {
            throw new Error(
                `Unknown lookup master: ${master}`
            );
        }

        const idField =
            config.idField ||
            "id";

        const parentField =
            config.parentField;

        const selectedColumns = [
            `${idField} AS id`,
            `${config.labelField} AS label`,
            `${config.valueField} AS value`
        ];

        if (
            parentField &&
            parentField !== idField &&
            parentField !==
                config.labelField &&
            parentField !==
                config.valueField
        ) {
            selectedColumns.push(
                `${parentField} AS ${parentField}`
            );
        }

        const [rows] =
            await pool.query(
                `
                SELECT
                    ${selectedColumns.join(",\n                    ")}
                FROM ${config.table}
                WHERE is_active = 1
                `
            );

        const byId =
            new Map();

        const byLabel =
            new Map();

        const byValue =
            new Map();

        for (const row of rows) {
            const id =
                Number(row.id);

            byId.set(
                String(row.id).trim(),
                id
            );

            const label =
                normalizeText(
                    row.label
                );

            const value =
                normalizeText(
                    row.value
                );

            if (label !== "") {
                if (
                    !byLabel.has(label)
                ) {
                    byLabel.set(
                        label,
                        []
                    );
                }

                byLabel
                    .get(label)
                    .push(id);
            }

            if (value !== "") {
                if (
                    !byValue.has(value)
                ) {
                    byValue.set(
                        value,
                        []
                    );
                }

                byValue
                    .get(value)
                    .push(id);
            }
        }

        lookupData.set(
            master,
            {
                config,
                rows,
                byId,
                byLabel,
                byValue
            }
        );
    }

    return lookupData;
}

function getLookupSuggestions(
    lookup,
    value
) {
    const normalizedValue =
        normalizeText(value);

    if (
        normalizedValue === ""
    ) {
        return [];
    }

    const suggestions =
        [];

    for (const row of lookup.rows) {
        const label =
            String(
                row.label ?? ""
            ).trim();

        if (
            label === ""
        ) {
            continue;
        }

        const normalizedLabel =
            normalizeText(
                label
            );

        if (
            normalizedLabel.includes(
                normalizedValue
            ) ||
            normalizedValue.includes(
                normalizedLabel
            )
        ) {
            suggestions.push(
                label
            );
        }

        if (
            suggestions.length >= 3
        ) {
            break;
        }
    }

    return suggestions;
}

function getResolvedLookupValue(
    lookup,
    matchingId,
    requestedValueField
) {
    if (
        requestedValueField ===
        "id"
    ) {
        return matchingId;
    }

    const matchingRow =
        lookup.rows.find(
            (row) =>
                Number(row.id) ===
                Number(matchingId)
        );

    if (!matchingRow) {
        return matchingId;
    }

    /*
     * lookup.rows already exposes the
     * configured master value as `value`.
     *
     * For example:
     * - user -> name
     * - godown -> id
     * - rack -> name
     * - sku -> sku_name
     * - party -> party_name
     */
    return matchingRow.value;
}

function resolveLookup(
    master,
    value,
    lookupData,
    requestedValueField,
    filters = {}
) {
    const lookup =
        lookupData.get(master);

    if (!lookup) {
        return {
            error: {
                message:
                    `Lookup master "${master}" is not configured.`,
                suggestion:
                    "Check the workflow field configuration."
            }
        };
    }

    if (isMissing(value)) {
        return {
            value,
            error: null
        };
    }

    const rawValue =
        String(value).trim();

    /*
     * Accept an ID as well.
     *
     * This keeps the validator backward
     * compatible while allowing users to
     * enter human-readable names.
     */
    const idMatch =
        lookup.byId.get(
            rawValue
        );

    if (
        idMatch !== undefined
    ) {
        return {
            value:
                getResolvedLookupValue(
                    lookup,
                    idMatch,
                    requestedValueField
                ),
            error: null
        };
    }

    const normalizedValue =
        normalizeText(value);

    const labelMatches =
        lookup.byLabel.get(
            normalizedValue
        ) || [];

    const valueMatches =
        lookup.byValue.get(
            normalizedValue
        ) || [];

    let matchingIds =
        [
            ...new Set([
                ...labelMatches,
                ...valueMatches
            ])
        ];

    if (
        lookup.config.parentField &&
        filters[
            lookup.config.parentField
        ] !== undefined &&
        filters[
            lookup.config.parentField
        ] !== null &&
        filters[
            lookup.config.parentField
        ] !== ""
    ) {
        const parentValue =
            Number(
                filters[
                    lookup.config.parentField
                ]
            );

        matchingIds =
            matchingIds.filter(
                (matchingId) => {
                    const matchingRow =
                        lookup.rows.find(
                            (row) =>
                                Number(
                                    row.id
                                ) ===
                                Number(
                                    matchingId
                                )
                        );

                    return (
                        matchingRow &&
                        Number(
                            matchingRow[
                                lookup.config.parentField
                            ]
                        ) ===
                            parentValue
                    );
                }
            );
    }

    if (
        matchingIds.length === 1
    ) {
        return {
            value:
                getResolvedLookupValue(
                    lookup,
                    matchingIds[0],
                    requestedValueField
                ),
            error: null
        };
    }

    if (
        matchingIds.length > 1
    ) {
        return {
            error: {
                message:
                    `Multiple active ${formatFieldName(
                        master
                    ).toLowerCase()} records match "${value}".`,
                suggestion:
                    "Use a unique name or database ID."
            }
        };
    }

    const suggestions =
        getLookupSuggestions(
            lookup,
            value
        );

    return {
        error: {
            message:
                `Active ${formatFieldName(
                    master
                ).toLowerCase()} "${value}" was not found.`,
            suggestion:
                suggestions.length > 0
                    ? `Did you mean: ${suggestions.join(
                          ", "
                      )}?`
                    : `Provide a valid active ${formatFieldName(
                          master
                      ).toLowerCase()} name.`
        }
    };
}

function validateRackBelongsToGodown(
    fields,
    normalizedRow,
    originalRow,
    lookupData,
    errors
) {
    const godownField =
        fields.find(
            (field) =>
                field.lookup?.master ===
                "godown"
        );

    const rackField =
        fields.find(
            (field) =>
                field.lookup?.master ===
                "rack"
        );

    if (
        !godownField ||
        !rackField
    ) {
        return;
    }

    const godownValue =
        originalRow[
            godownField.key
        ];

    const rackValue =
        originalRow[
            rackField.key
        ];

    if (
        isMissing(godownValue) ||
        isMissing(rackValue)
    ) {
        return;
    }

    const godownId =
        normalizedRow[
            godownField.key
        ];

    const rackId =
        normalizedRow[
            rackField.key
        ];

    if (
        !Number.isInteger(
            Number(godownId)
        ) ||
        !Number.isInteger(
            Number(rackId)
        )
    ) {
        return;
    }

    const rackLookup =
        lookupData.get("rack");

    if (!rackLookup) {
        return;
    }

    const rack =
        rackLookup.rows.find(
            (row) =>
                Number(row.id) ===
                Number(rackId)
        );

    if (!rack) {
        return;
    }

    const parentField =
        rackLookup.config
            .parentField;

    if (!parentField) {
        return;
    }

    if (
        Number(
            rack[parentField]
        ) !==
        Number(godownId)
    ) {
        errors.push({
            field:
                `${godownField.key}, ${rackField.key}`,
            message:
                `Rack "${rack.label}" does not belong to the selected godown.`,
            suggestion:
                "Select a rack that belongs to the selected godown."
        });
    }
}

function validateRow(
    fields,
    row,
    lookupData,
    rowNumber
) {
    const errors = [];
    const normalizedRow = {};

    if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row)
    ) {
        return {
            rowNumber,
            data: row,
            normalizedData: null,
            valid: false,
            errors: [
                {
                    field: null,
                    message:
                        "Invalid row data.",
                    suggestion:
                        "Check the Excel row and make sure it contains valid values."
                }
            ]
        };
    }

    for (const field of fields) {
        const rawValue =
            row[field.key];

        if (
            field.required === true &&
            isMissing(rawValue)
        ) {
            errors.push({
                field: field.key,
                message:
                    "Required value is missing.",
                suggestion:
                    `Provide a value for ${formatFieldName(
                        field.key
                    )}.`
            });

            continue;
        }

        if (isMissing(rawValue)) {
            normalizedRow[
                field.key
            ] = rawValue;

            continue;
        }

        let value;

        if (
            field.lookup?.master
        ) {
            let lookupFilters = {};

            if (
                field.lookup.master ===
                    "rack"
            ) {
                const godownField =
                    fields.find(
                        (candidate) =>
                            candidate.lookup?.master ===
                            "godown"
                    );

                if (
                    godownField &&
                    normalizedRow[
                        godownField.key
                    ] !== undefined &&
                    normalizedRow[
                        godownField.key
                    ] !== null &&
                    normalizedRow[
                        godownField.key
                    ] !== ""
                ) {
                    lookupFilters = {
                        godown_id:
                            normalizedRow[
                                godownField.key
                            ]
                    };
                }
            }

            const lookupResult =
                resolveLookup(
                    field.lookup.master,
                    rawValue,
                    lookupData,
                    field.lookup.valueField,
                    lookupFilters
                );

            if (
                lookupResult.error
            ) {
                errors.push({
                    field: field.key,
                    ...lookupResult.error
                });

                continue;
            }

            value =
                lookupResult.value;
        } else {
            value =
                normalizeFieldValue(
                    field,
                    rawValue
                );
        }

        const datatypeError =
            validateDataType(
                field,
                value
            );

        if (datatypeError) {
            errors.push({
                field: field.key,
                ...datatypeError
            });

            continue;
        }

        if (
            Array.isArray(
                field.options
            )
        ) {
            const validOption =
                field.options.some(
                    (option) =>
                        String(option) ===
                        String(value)
                );

            if (!validOption) {
                errors.push({
                    field: field.key,
                    message:
                        `Invalid value "${value}".`,
                    suggestion:
                        `Use one of: ${field.options.join(
                            ", "
                        )}.`
                });

                continue;
            }
        }

        normalizedRow[
            field.key
        ] = value;
    }

    validateRackBelongsToGodown(
        fields,
        normalizedRow,
        row,
        lookupData,
        errors
    );

    return {
        rowNumber,
        data: row,
        normalizedData:
            normalizedRow,
        valid:
            errors.length === 0,
        errors
    };
}

function validateHeaders(
    rows,
    fields
) {
    const expectedHeaders =
        fields.map(
            (field) =>
                field.key
        );

    const actualHeaders =
        Object.keys(
            rows[0] || {}
        );

    const missingHeaders =
        expectedHeaders.filter(
            (header) =>
                !actualHeaders.includes(
                    header
                )
        );

    if (
        missingHeaders.length > 0
    ) {
        throw new Error(
            `Missing required column(s): ${missingHeaders.join(
                ", "
            )}`
        );
    }

    const unexpectedHeaders =
        actualHeaders.filter(
            (header) =>
                !expectedHeaders.includes(
                    header
                )
        );

    if (
        unexpectedHeaders.length > 0
    ) {
        throw new Error(
            `Unexpected column(s): ${unexpectedHeaders.join(
                ", "
            )}`
        );
    }
}

export async function validateWorkflowArrayRows({
    fields,
    rows
}) {
    if (
        !Array.isArray(fields) ||
        fields.length === 0
    ) {
        throw new Error(
            "Array field definition is required"
        );
    }

    if (
        !Array.isArray(rows)
    ) {
        throw new Error(
            "Excel data must contain rows"
        );
    }

    if (
        rows.length === 0
    ) {
        throw new Error(
            "Excel file does not contain any data rows"
        );
    }

    /*
     * Excel rows represent items of one
     * array field. Nested arrays are not
     * supported here.
     */
    if (
        fields.some(
            (field) =>
                field.dataType ===
                "array"
        )
    ) {
        throw new Error(
            "Nested array fields are not supported in workflow bulk upload."
        );
    }

    validateHeaders(
        rows,
        fields
    );

    /*
     * Load every lookup master once.
     *
     * This prevents one database query per
     * Excel row and is important for large
     * Excel uploads.
     */
    const lookupData =
        await loadLookupData(
            fields
        );

    const validatedRows =
        [];

    for (
        let index = 0;
        index < rows.length;
        index++
    ) {
        const result =
            validateRow(
                fields,
                rows[index],
                lookupData,
                index + 2
            );

        validatedRows.push(
            result
        );
    }

    const validRows =
        validatedRows.filter(
            (row) =>
                row.valid
        ).length;

    const invalidRows =
        validatedRows.length -
        validRows;

    return {
        totalRows:
            validatedRows.length,
        validRows,
        invalidRows,
        rows:
            validatedRows
    };
}