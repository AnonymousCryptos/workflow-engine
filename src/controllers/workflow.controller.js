import XLSX from "xlsx";

import {
    createWorkflowService,
    getAllWorkflowsService,
    createWorkflowRunService,
    submitWorkflowStageService,
    skipWorkflowStageService,
    getWorkflowByIdService,
    getActiveWorkflowRunsService,
    getWorkflowRunByIdService,
    getWorkflowRunHistoryService,
    getWorkflowStageHistoryService
} from "../services/workflow.service.js";

import {
    generateWorkflowPdf
} from "../services/workflowPdf.service.js";

import {
    validateWorkflowArrayRows
} from "../database/workflow-bulk.repository.js";

import {
    createWorkflowValidation,
    getWorkflowValidation
} from "../services/workflow-bulk.service.js";

function formatFieldName(
    fieldName
) {
    return String(fieldName)
        .replace(/_/g, " ")
        .replace(
            /\b\w/g,
            (character) =>
                character.toUpperCase()
        );
}

export async function createWorkflow(
    req,
    res
) {
    try {
        const workflowId =
            await createWorkflowService(
                req.body
            );

        res.status(201).json({
            success: true,
            workflowId
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

export async function getAllWorkflows(
    req,
    res
) {
    try {
        const workflows =
            await getAllWorkflowsService();

        res.json({
            success: true,
            data: workflows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

export async function createWorkflowRun(
    req,
    res
) {
    try {
        const {
            workflowId,
            stageData
        } = req.body;

        const result =
            await createWorkflowRunService({
                workflowId,
                stageData,
                userId: req.user.userId
            });

        res.status(201).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

export async function getActiveWorkflowRuns(
    req,
    res
) {
    try {
        const runs =
            await getActiveWorkflowRunsService();

        res.json({
            success: true,
            data: runs
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

export async function getWorkflowRunHistory(
    req,
    res
) {
    try {
        const {
            page = 1,
            limit = 20
        } = req.query;

        const result =
            await getWorkflowRunHistoryService({
                page,
                limit
            });

        res.json({
            success: true,
            data: result.data,
            pagination:
                result.pagination
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

export async function getWorkflowStageHistory(
    req,
    res
) {
    try {
        const { id } =
            req.params;

        const {
            page = 1,
            limit = 20
        } = req.query;

        const result =
            await getWorkflowStageHistoryService({
                workflowRunId: id,
                page,
                limit
            });

        res.json({
            success: true,
            data: result.data,
            pagination:
                result.pagination
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

export async function submitWorkflowStage(
    req,
    res
) {
    try {
        const { id } =
            req.params;

        const { stageData } =
            req.body;

        const result =
            await submitWorkflowStageService({
                workflowRunId: id,
                stageData,
                userId: req.user.userId
            });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

export async function skipWorkflowStage(
    req,
    res
) {
    try {
        const { id } =
            req.params;

        const result =
            await skipWorkflowStageService({
                workflowRunId: id,
                userId: req.user.userId
            });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

export async function getWorkflowById(
    req,
    res
) {
    try {
        const { id } =
            req.params;

        const workflow =
            await getWorkflowByIdService(id);

        res.json({
            success: true,
            data: workflow
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
}

export async function downloadWorkflowPdf(
    req,
    res
) {
    try {
        const { id } =
            req.params;

        const { stage_id } =
            req.query;

        if (
            stage_id === undefined ||
            stage_id === ""
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "stage_id is required"
            });
        }

        const stageId =
            Number(stage_id);

        if (
            !Number.isInteger(stageId) ||
            stageId < 1
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "stage_id must be a positive integer"
            });
        }

        const pdf =
            await generateWorkflowPdf(
                id,
                stageId
            );

        res.setHeader(
            "Content-Type",
            "application/pdf"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="workflow-${id}-stage-${stageId}.pdf"`
        );

        res.send(pdf);
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

export async function getWorkflowRunById(
    req,
    res
) {
    try {
        const { id } =
            req.params;

        const run =
            await getWorkflowRunByIdService(
                id
            );

        res.json({
            success: true,
            data: run
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
}

export async function validateWorkflowBulkUpload(
    req,
    res
) {
    try {
        const {
            workflowId,
            stageId,
            arrayFieldKey
        } = req.body;

        if (!workflowId) {
            return res.status(400).json({
                success: false,
                message:
                    "Workflow ID is required"
            });
        }

        if (!stageId) {
            return res.status(400).json({
                success: false,
                message:
                    "Stage ID is required"
            });
        }

        if (
            !arrayFieldKey ||
            typeof arrayFieldKey !==
                "string"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Array field key is required"
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message:
                    "Excel file is required"
            });
        }

        const originalName =
            String(
                req.file.originalname || ""
            ).toLowerCase();

        const extension =
            originalName
                .split(".")
                .pop();

        if (
            !["xlsx", "xls"].includes(
                extension
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Please upload an Excel file (.xlsx or .xls)."
            });
        }

        const workflow =
            await getWorkflowByIdService(
                workflowId
            );

        const stage =
            workflow.stages?.find(
                (item) =>
                    Number(item.id) ===
                    Number(stageId)
            );

        if (!stage) {
            return res.status(400).json({
                success: false,
                message:
                    `Stage "${stageId}" not found in workflow`
            });
        }

        const arrayField =
            stage.fields?.find(
                (field) =>
                    field.key ===
                        arrayFieldKey &&
                    field.dataType ===
                        "array"
            );

        if (!arrayField) {
            return res.status(400).json({
                success: false,
                message:
                    `Array field "${arrayFieldKey}" not found in stage`
            });
        }

        const workbook =
            XLSX.read(
                req.file.buffer,
                {
                    type: "buffer",
                    cellDates: true
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
            await validateWorkflowArrayRows({
                fields:
                    arrayField.fields ||
                    [],
                rows
            });

        const validationId =
            createWorkflowValidation({
                workflowId:
                    Number(workflowId),
                stageId:
                    Number(stageId),
                arrayFieldKey,
                rows,
                result
            });

        res.json({
            success: true,
            workflowId:
                Number(workflowId),
            stageId:
                Number(stageId),
            arrayFieldKey,
            validationId,
            totalRows:
                result.totalRows,
            validRows:
                result.validRows,
            invalidRows:
                result.invalidRows,
            rows:
                result.rows.map(
                    (row) => ({
                        rowNumber:
                            row.rowNumber,
                        data:
                            row.data,
                        normalizedData:
                            row.normalizedData,
                        valid:
                            row.valid,
                        errors:
                            row.errors
                    })
                )
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message:
                error.message ||
                "Failed to validate workflow Excel file"
        });
    }
}

export async function downloadFailedWorkflowRows(
    req,
    res
) {
    try {
        const {
            validationId
        } = req.params;

        const validation =
            getWorkflowValidation(
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
            `attachment; filename="workflow-failed-records.xlsx"`
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