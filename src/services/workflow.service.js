import {
    createWorkflow,
    getAllWorkflows,
    getWorkflowById
} from "../database/workflow.repository.js";

import {
    createWorkflowRun,
    getWorkflowRunById,
    getActiveWorkflowRuns,
    getWorkflowRunHistory,
    getWorkflowStageHistory,
    submitWorkflowStage
} from "../database/workflowRun.repository.js";

function validateFields(
    fields,
    scope = "fields"
) {
    if (!Array.isArray(fields)) {
        throw new Error(
            `${scope} must be an array`
        );
    }

    const keys = new Set();

    for (const field of fields) {
        if (
            !field ||
            typeof field !== "object" ||
            Array.isArray(field)
        ) {
            throw new Error(
                `Invalid field definition in ${scope}`
            );
        }

        if (
            typeof field.key !== "string" ||
            field.key.trim() === ""
        ) {
            throw new Error(
                `Every field in ${scope} must have a key`
            );
        }

        if (keys.has(field.key)) {
            throw new Error(
                `Duplicate field key "${field.key}" in ${scope}`
            );
        }

        keys.add(field.key);

        if (
            typeof field.label !== "string" ||
            field.label.trim() === ""
        ) {
            throw new Error(
                `Field "${field.key}" must have a label`
            );
        }

        if (
            typeof field.dataType !== "string" ||
            field.dataType.trim() === ""
        ) {
            throw new Error(
                `Field "${field.key}" must have a dataType`
            );
        }

        if (
            typeof field.component !== "string" ||
            field.component.trim() === ""
        ) {
            throw new Error(
                `Field "${field.key}" must have a component`
            );
        }

        if (field.dataType === "array") {
            if (field.component !== "array") {
                throw new Error(
                    `Array field "${field.key}" must use component "array"`
                );
            }

            if (
                !Object.prototype.hasOwnProperty.call(
                    field,
                    "fields"
                )
            ) {
                throw new Error(
                    `Array field "${field.key}" must contain a "fields" property`
                );
            }

            if (!Array.isArray(field.fields)) {
                throw new Error(
                    `The "fields" property of array field "${field.key}" must be an array`
                );
            }

            if (field.fields.length === 0) {
                throw new Error(
                    `Array field "${field.key}" must contain at least one field`
                );
            }

            validateFields(
                field.fields,
                `fields of "${field.key}"`
            );
        }
    }
}

function validateWorkflow(workflow) {
    if (
        !workflow ||
        typeof workflow !== "object"
    ) {
        throw new Error(
            "Workflow data is required"
        );
    }

    if (
        typeof workflow.name !== "string" ||
        workflow.name.trim() === ""
    ) {
        throw new Error(
            "Workflow name is required"
        );
    }

    if (
        !Array.isArray(workflow.stages) ||
        workflow.stages.length === 0
    ) {
        throw new Error(
            "Workflow must contain at least one stage"
        );
    }

    const stageIds = new Set();

    for (const stage of workflow.stages) {
        if (
            !stage ||
            typeof stage !== "object" ||
            Array.isArray(stage)
        ) {
            throw new Error(
                "Invalid stage definition"
            );
        }

        if (
            stage.id === undefined ||
            stage.id === null ||
            stage.id === ""
        ) {
            throw new Error(
                "Every stage must have an id"
            );
        }

        if (stageIds.has(stage.id)) {
            throw new Error(
                `Duplicate stage id "${stage.id}"`
            );
        }

        stageIds.add(stage.id);

        if (
            typeof stage.name !== "string" ||
            stage.name.trim() === ""
        ) {
            throw new Error(
                `Stage "${stage.id}" must have a name`
            );
        }

        if (!Array.isArray(stage.fields)) {
            throw new Error(
                `Stage "${stage.name}" must contain a fields array`
            );
        }

        validateFields(
            stage.fields,
            `fields of stage "${stage.name}"`
        );
    }
}

/*
 * Applies values for system controlled fields.
 *
 * A field is system controlled when:
 *
 *     hidden === true
 *     readonly === true
 *
 * The client supplied value is never trusted.
 *
 * If the field has a defaultValue, that value is
 * written into the stage data.
 *
 * If it has no defaultValue, the field is removed
 * from the submitted data.
 *
 * Array fields are handled recursively so this also
 * works for system controlled fields inside arrays.
 */
function applySystemControlledFields(
    fields,
    stageData
) {
    const normalizedData = {
        ...(stageData || {})
    };

    for (const field of fields) {
        const isSystemControlled =
            field.hidden === true &&
            field.readonly === true;

        if (isSystemControlled) {
            if (
                Object.prototype.hasOwnProperty.call(
                    field,
                    "defaultValue"
                )
            ) {
                normalizedData[field.key] =
                    field.defaultValue;
            } else {
                delete normalizedData[field.key];
            }

            continue;
        }

        if (
            field.dataType === "array" &&
            Array.isArray(
                normalizedData[field.key]
            )
        ) {
            normalizedData[field.key] =
                normalizedData[field.key].map(
                    (row) =>
                        applySystemControlledFields(
                            field.fields || [],
                            row
                        )
                );
        }
    }

    return normalizedData;
}

export async function createWorkflowService(
    workflow
) {
    validateWorkflow(workflow);

    const workflowId =
        await createWorkflow(workflow);

    return workflowId;
}

export async function getAllWorkflowsService() {
    return await getAllWorkflows();
}

export async function createWorkflowRunService({
    workflowId,
    stageData
}) {
    if (!workflowId) {
        throw new Error(
            "Workflow ID is required"
        );
    }

    if (
        !stageData ||
        typeof stageData !== "object" ||
        Array.isArray(stageData)
    ) {
        throw new Error(
            "Stage data is required"
        );
    }

    const workflow =
        await getWorkflowById(workflowId);

    if (!workflow) {
        throw new Error(
            "Workflow not found"
        );
    }

    if (!workflow.isActive) {
        throw new Error(
            "Workflow is inactive"
        );
    }

    if (
        !Array.isArray(workflow.stages) ||
        workflow.stages.length === 0
    ) {
        throw new Error(
            "Workflow has no stages"
        );
    }

    const firstStage =
        workflow.stages[0];

    const normalizedStageData =
        applySystemControlledFields(
            firstStage.fields || [],
            stageData
        );

    const nextStage =
        workflow.stages[1] || null;

    const isCompleted =
        nextStage === null;

    const referenceId =
        `WF-${Date.now()}`;

    const workflowRunId =
        await createWorkflowRun({
            referenceId,
            workflowId,
            currentStageId:
                isCompleted
                    ? firstStage.id
                    : nextStage.id,
            activeStageData: {},
            stageId: firstStage.id,
            stageData:
                normalizedStageData,
            remark:
                normalizedStageData.remark ||
                null,
            completed: isCompleted
        });

    return {
        workflowRunId,
        referenceId,
        currentStageId:
            isCompleted
                ? firstStage.id
                : nextStage.id,
        status:
            isCompleted
                ? "completed"
                : "running"
    };
}

export async function submitWorkflowStageService({
    workflowRunId,
    stageData
}) {
    if (!workflowRunId) {
        throw new Error(
            "Workflow run ID is required"
        );
    }

    if (
        !stageData ||
        typeof stageData !== "object" ||
        Array.isArray(stageData)
    ) {
        throw new Error(
            "Stage data is required"
        );
    }

    const run =
        await getWorkflowRunById(
            workflowRunId
        );

    if (!run) {
        throw new Error(
            "Workflow run not found"
        );
    }

    if (run.status === "completed") {
        throw new Error(
            "Workflow run is already completed"
        );
    }

    const workflow =
        await getWorkflowById(
            run.workflowId
        );

    if (!workflow) {
        throw new Error(
            "Workflow not found"
        );
    }

    const currentStageIndex =
        workflow.stages.findIndex(
            (stage) =>
                Number(stage.id) ===
                Number(run.currentStageId)
        );

    if (currentStageIndex === -1) {
        throw new Error(
            `Current stage "${run.currentStageId}" not found in workflow`
        );
    }

    const currentStage =
        workflow.stages[
            currentStageIndex
        ];

    const normalizedStageData =
        applySystemControlledFields(
            currentStage.fields || [],
            stageData
        );

    const nextStage =
        workflow.stages[
            currentStageIndex + 1
        ] || null;

    const isCompleted =
        nextStage === null;

    await submitWorkflowStage({
        workflowRunId,
        nextStageId:
            isCompleted
                ? currentStage.id
                : nextStage.id,
        stageId: currentStage.id,
        stageData:
            normalizedStageData,
        remark:
            normalizedStageData.remark ||
            null,
        completed: isCompleted
    });

    return {
        workflowRunId,
        referenceId: run.referenceId,
        currentStageId:
            isCompleted
                ? currentStage.id
                : nextStage.id,
        status:
            isCompleted
                ? "completed"
                : "running",
        completed: isCompleted
    };
}

export async function getActiveWorkflowRunsService() {
    const runs =
        await getActiveWorkflowRuns();

    return runs;
}

export async function getWorkflowRunHistoryService({
    page = 1,
    limit = 20
}) {
    const parsedPage =
        Number(page);

    const parsedLimit =
        Number(limit);

    if (
        !Number.isInteger(parsedPage) ||
        parsedPage < 1
    ) {
        throw new Error(
            "Page must be a positive integer"
        );
    }

    if (
        !Number.isInteger(parsedLimit) ||
        parsedLimit < 1
    ) {
        throw new Error(
            "Limit must be a positive integer"
        );
    }

    const safeLimit =
        Math.min(parsedLimit, 100);

    const result =
        await getWorkflowRunHistory({
            page: parsedPage,
            limit: safeLimit
        });

    return {
        data: result.rows,
        pagination: {
            page: parsedPage,
            limit: safeLimit,
            total: result.total,
            totalPages:
                Math.ceil(
                    result.total /
                        safeLimit
                )
        }
    };
}

export async function getWorkflowStageHistoryService({
    workflowRunId,
    page = 1,
    limit = 20
}) {
    if (!workflowRunId) {
        throw new Error(
            "Workflow run ID is required"
        );
    }

    const parsedPage =
        Number(page);

    const parsedLimit =
        Number(limit);

    if (
        !Number.isInteger(parsedPage) ||
        parsedPage < 1
    ) {
        throw new Error(
            "Page must be a positive integer"
        );
    }

    if (
        !Number.isInteger(parsedLimit) ||
        parsedLimit < 1
    ) {
        throw new Error(
            "Limit must be a positive integer"
        );
    }

    const safeLimit =
        Math.min(parsedLimit, 100);

    const run =
        await getWorkflowRunById(
            workflowRunId
        );

    if (!run) {
        throw new Error(
            "Workflow run not found"
        );
    }

    const workflow =
        await getWorkflowById(
            run.workflowId
        );

    if (!workflow) {
        throw new Error(
            "Workflow not found"
        );
    }

    const result =
        await getWorkflowStageHistory({
            workflowRunId,
            page: parsedPage,
            limit: safeLimit
        });

    const data =
        result.rows.map((stage) => {
            const workflowStage =
                workflow.stages?.find(
                    (item) =>
                        Number(item.id) ===
                        Number(stage.stageId)
                );

            return {
                ...stage,
                stageName:
                    workflowStage?.name ||
                    `Stage ${stage.stageId}`
            };
        });

    return {
        data,
        pagination: {
            page: parsedPage,
            limit: safeLimit,
            total: result.total,
            totalPages:
                Math.ceil(
                    result.total /
                        safeLimit
                )
        }
    };
}

export async function getWorkflowByIdService(
    workflowId
) {
    const workflow =
        await getWorkflowById(workflowId);

    if (!workflow) {
        throw new Error(
            "Workflow not found"
        );
    }

    return workflow;
}

export async function getWorkflowRunByIdService(
    workflowRunId
) {
    if (!workflowRunId) {
        throw new Error(
            "Workflow run ID is required"
        );
    }

    const run =
        await getWorkflowRunById(
            workflowRunId
        );

    if (!run) {
        throw new Error(
            "Workflow run not found"
        );
    }

    return run;
}