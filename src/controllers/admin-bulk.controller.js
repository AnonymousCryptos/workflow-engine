import * as XLSX from "xlsx";

import {
    validateAdminRows,
    insertValidatedAdminRows
} from "../database/admin.repository.js";

import {
    ADMIN_TABLES
} from "../config/admin-tables.js";

import {
    createValidation,
    getValidation,
    deleteValidation
} from "../services/admin-bulk.service.js";

export async function downloadAdminTableTemplate(
    req,
    res
) {
    try {
        const { table } =
            req.params;

        const tableConfig =
            ADMIN_TABLES[table];

        if (!tableConfig) {
            return res.status(404).json({
                success: false,
                message:
                    "Admin table not found"
            });
        }

        const writableFields =
            Object.keys(
                tableConfig.writableFields ||
                    {}
            );

        if (
            writableFields.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "No writable fields configured for this table"
            });
        }

        const workbook =
            XLSX.utils.book_new();

        const worksheet =
            XLSX.utils.aoa_to_sheet([
                writableFields
            ]);

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            table
        );

        const buffer =
            XLSX.write(
                workbook,
                {
                    type: "buffer",
                    bookType: "xlsx"
                }
            );

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${table}-template.xlsx"`
        );

        res.send(buffer);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message:
                "Failed to generate template"
        });
    }
}

export async function validateAdminTableUpload(
    req,
    res
) {
    try {
        const { table } =
            req.params;

        const tableConfig =
            ADMIN_TABLES[table];

        if (!tableConfig) {
            return res.status(404).json({
                success: false,
                message:
                    "Admin table not found"
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message:
                    "Excel file is required"
            });
        }

        const workbook =
            XLSX.read(
                req.file.buffer,
                {
                    type: "buffer"
                }
            );

        const sheetName =
            workbook.SheetNames[0];

        if (!sheetName) {
            return res.status(400).json({
                success: false,
                message:
                    "Excel file does not contain a worksheet"
            });
        }

        const worksheet =
            workbook.Sheets[
                sheetName
            ];

        const rows =
            XLSX.utils.sheet_to_json(
                worksheet,
                {
                    defval: null,
                    raw: true
                }
            );

        const result =
            await validateAdminRows(
                table,
                rows,
                tableConfig
            );

        /*
         * Store the original rows server-side.
         * This includes passwords entered by
         * the admin and is required later when
         * valid rows are inserted.
         */
        const validationId =
            createValidation({
                table,
                rows,
                result
            });

        res.json({
            success: true,
            table,
            validationId,
            totalRows:
                result.totalRows,
            validRows:
                result.validRows,
            invalidRows:
                result.invalidRows,
            rows:
                result.rows
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message:
                error.message ||
                "Failed to validate Excel file"
        });
    }
}

export async function downloadFailedAdminRows(
    req,
    res
) {
    try {
        const {
            validationId
        } = req.params;

        const validation =
            getValidation(
                validationId
            );

        if (!validation) {
            return res.status(404).json({
                success: false,
                message:
                    "Validation result has expired or does not exist."
            });
        }

        const failedRows =
            validation.result.rows.filter(
                (row) =>
                    !row.valid
            );

        if (
            failedRows.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "There are no failed records to download."
            });
        }

        const outputRows =
            failedRows.map(
                (row) => {
                    const errorText =
                        row.errors
                            .map(
                                (error) =>
                                    error.field
                                        ? `${formatFieldName(
                                              error.field
                                          )}: ${error.message}`
                                        : error.message
                            )
                            .join(
                                " | "
                            );

                    const suggestionText =
                        row.errors
                            .map(
                                (error) =>
                                    error.suggestion ||
                                    ""
                            )
                            .filter(
                                Boolean
                            )
                            .join(
                                " | "
                            );

                    return {
                        ...row.data,
                        error:
                            errorText,
                        suggestion:
                            suggestionText
                    };
                }
            );

        const workbook =
            XLSX.utils.book_new();

        const worksheet =
            XLSX.utils.json_to_sheet(
                outputRows
            );

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Failed Records"
        );

        const buffer =
            XLSX.write(
                workbook,
                {
                    type: "buffer",
                    bookType: "xlsx"
                }
            );

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${validation.table}-failed-records.xlsx"`
        );

        res.send(buffer);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message:
                "Failed to generate failed-record report"
        });
    }
}

function formatFieldName(
    fieldName
) {
    return fieldName
        .replace(/_/g, " ")
        .replace(
            /\b\w/g,
            (character) =>
                character.toUpperCase()
        );
}

export async function insertValidatedAdminRowsController(
    req,
    res
) {
    try {
        const { table } =
            req.params;

        const {
            validationId
        } = req.body;

        const tableConfig =
            ADMIN_TABLES[table];

        if (!tableConfig) {
            return res.status(404).json({
                success: false,
                message:
                    "Admin table not found"
            });
        }

        if (!validationId) {
            return res.status(400).json({
                success: false,
                message:
                    "Validation ID is required"
            });
        }

        const validation =
            getValidation(
                validationId
            );

        if (!validation) {
            return res.status(404).json({
                success: false,
                message:
                    "Validation result has expired or does not exist. Please upload the Excel file again."
            });
        }

        if (
            validation.table !== table
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Validation result does not belong to this table."
            });
        }

        const validRows =
            validation.result.rows.filter(
                (row) =>
                    row.valid
            );

        if (
            validRows.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "There are no valid records to insert."
            });
        }

        const result =
            await insertValidatedAdminRows(
                table,
                validRows,
                tableConfig
            );

        deleteValidation(
            validationId
        );

        res.json({
            success: true,
            message:
                `${result.insertedCount} record(s) inserted successfully.`,
            insertedCount:
                result.insertedCount,
            insertedIds:
                result.insertedIds
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message:
                error.message ||
                "Failed to insert valid records"
        });
    }
}