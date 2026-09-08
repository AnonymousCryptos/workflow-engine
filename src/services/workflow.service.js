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
    getPreviousStageHistory,
    submitWorkflowStage
} from "../database/workflowRun.repository.js";

import {
    generateWorkflowPdf
} from "../services/workflowPdf.service.js";

import { getPool } from "../config/database.js";

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

        /*
         * Fields with fixed options must define
         * options as a non-empty array.
         *
         * This is intentionally based on the
         * field definition, not on any field key.
         */
        if (
            Object.prototype.hasOwnProperty.call(
                field,
                "options"
            )
        ) {
            if (
                !Array.isArray(field.options) ||
                field.options.length === 0
            ) {
                throw new Error(
                    `Field "${field.key}" options must be a non-empty array`
                );
            }

            const optionValues =
                new Set();

            for (const option of field.options) {
                if (
                    option === null ||
                    option === undefined ||
                    (
                        typeof option !== "string" &&
                        typeof option !== "number"
                    )
                ) {
                    throw new Error(
                        `Field "${field.key}" options must contain only strings or numbers`
                    );
                }

                if (
                    optionValues.has(option)
                ) {
                    throw new Error(
                        `Field "${field.key}" options cannot contain duplicate values`
                    );
                }

                optionValues.add(option);
            }
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

function validateStageData(
    fields,
    stageData,
    scope = "stage data"
) {
    if (
        !stageData ||
        typeof stageData !== "object" ||
        Array.isArray(stageData)
    ) {
        throw new Error(
            `${scope} must be an object`
        );
    }

    for (const field of fields) {
        const hasValue =
            Object.prototype.hasOwnProperty.call(
                stageData,
                field.key
            );

        /*
         * Required validation.
         *
         * System-controlled fields have already
         * been normalized before this function runs.
         */
        if (
            field.required === true &&
            (
                !hasValue ||
                stageData[field.key] === null ||
                stageData[field.key] === undefined ||
                stageData[field.key] === ""
            )
        ) {
            throw new Error(
                `Field "${field.label}" is required`
            );
        }

        /*
         * Nothing further to validate when the
         * optional field has no value.
         */
        if (
            !hasValue ||
            stageData[field.key] === null ||
            stageData[field.key] === undefined ||
            stageData[field.key] === ""
        ) {
            continue;
        }

        const value =
            stageData[field.key];

        /*
         * Fixed-value validation.
         *
         * The field definition is the source
         * of truth. No field names are hardcoded.
         */
        if (
            Array.isArray(field.options)
        ) {
            const isAllowed =
                field.options.some(
                    (option) =>
                        option === value
                );

            if (!isAllowed) {
                throw new Error(
                    `Invalid value for field "${field.label}". Allowed values: ${field.options.join(", ")}`
                );
            }
        }

        /*
         * Recursively validate array fields.
         */
        if (field.dataType === "array") {
            if (!Array.isArray(value)) {
                throw new Error(
                    `Field "${field.label}" must be an array`
                );
            }

            if (
                field.required === true &&
                value.length === 0
            ) {
                throw new Error(
                    `Field "${field.label}" must contain at least one item`
                );
            }

            /*
            * assigned_users has a special valid
            * representation: ["anyone"].
            *
            * It is handled separately by
            * normalizeAssignedUsers().
            */
            if (
                field.key === "assigned_users" &&
                value.length === 1 &&
                value[0] === "anyone"
            ) {
                continue;
            }

            for (
                let index = 0;
                index < value.length;
                index++
            ) {
                const row =
                    value[index];

                if (
                    !row ||
                    typeof row !== "object" ||
                    Array.isArray(row)
                ) {
                    throw new Error(
                        `Item ${index + 1} of field "${field.label}" must be an object`
                    );
                }

                validateStageData(
                    field.fields || [],
                    row,
                    `${scope}.${field.key}[${index}]`
                );
            }
        }
    }
}

function validateAssignedUsers(
    value,
    scope
) {
    if (value === "anyone") {
        return "anyone";
    }

    if (!Array.isArray(value)) {
        throw new Error(
            `${scope} must be "anyone" or an array of user IDs`
        );
    }

    if (value.length === 0) {
        throw new Error(
            `${scope} must contain at least one user`
        );
    }

    if (
        value.length === 1 &&
        value[0] === "anyone"
    ) {
        return "anyone";
    }

    const seen = new Set();
    const normalized = [];

    for (const userId of value) {
        if (userId === "anyone") {
            throw new Error(
                `${scope} cannot contain "anyone" together with user IDs`
            );
        }

        const numericUserId =
            Number(userId);

        if (
            !Number.isInteger(
                numericUserId
            ) ||
            numericUserId < 1
        ) {
            throw new Error(
                `${scope} must contain only valid user IDs`
            );
        }

        if (
            seen.has(
                numericUserId
            )
        ) {
            throw new Error(
                `${scope} cannot contain duplicate user IDs`
            );
        }

        seen.add(
            numericUserId
        );

        normalized.push(
            numericUserId
        );
    }

    return normalized;
}

function validateCanCreate(
    value
) {
    return validateAssignedUsers(
        value,
        "canCreate"
    );
}

function validateWorkflow(
    workflow
) {
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
        !Object.prototype.hasOwnProperty.call(
            workflow,
            "canCreate"
        )
    ) {
        throw new Error(
            "Workflow canCreate is required"
        );
    }

    validateCanCreate(
        workflow.canCreate
    );

    if (
        !Array.isArray(workflow.stages) ||
        workflow.stages.length === 0
    ) {
        throw new Error(
            "Workflow must contain at least one stage"
        );
    }

    const stageIds = new Set();

    for (
        let index = 0;
        index < workflow.stages.length;
        index++
    ) {
        const stage =
            workflow.stages[index];

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

        if (
            stageIds.has(stage.id)
        ) {
            throw new Error(
                `Duplicate stage id "${stage.id}"`
            );
        }

        stageIds.add(
            stage.id
        );

        if (
            typeof stage.name !== "string" ||
            stage.name.trim() === ""
        ) {
            throw new Error(
                `Stage "${stage.id}" must have a name`
            );
        }

        if (
            !Array.isArray(stage.fields)
        ) {
            throw new Error(
                `Stage "${stage.name}" must contain a fields array`
            );
        }

        validateFields(
            stage.fields,
            `fields of stage "${stage.name}"`
        );

        /*
         * Every stage except the final
         * stage must contain exactly one
         * assigned_users field.
         *
         * assigned_users represents the
         * users who may perform the NEXT
         * stage.
         */
        if (
            index <
            workflow.stages.length - 1
        ) {
            const assignedUsersFields =
                stage.fields.filter(
                    (field) =>
                        field.key ===
                        "assigned_users"
                );

            if (
                assignedUsersFields.length !==
                1
            ) {
                throw new Error(
                    `Stage "${stage.name}" must contain exactly one assigned_users field`
                );
            }

            const assignedUsersField =
                assignedUsersFields[0];

            if (
                assignedUsersField.dataType !==
                    "array" ||
                assignedUsersField.component !==
                    "array"
            ) {
                throw new Error(
                    `The assigned_users field in stage "${stage.name}" must be an array field`
                );
            }

            if (
                assignedUsersField.required !==
                true
            ) {
                throw new Error(
                    `The assigned_users field in stage "${stage.name}" must be required`
                );
            }
        } else {
            /*
             * Final stage has no next stage,
             * therefore it must not define
             * assigned_users.
             */
            const assignedUsersFields =
                stage.fields.filter(
                    (field) =>
                        field.key ===
                        "assigned_users"
                );

            if (
                assignedUsersFields.length > 0
            ) {
                throw new Error(
                    `Final stage "${stage.name}" must not contain an assigned_users field`
                );
            }
        }
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
                normalizedData[
                    field.key
                ] =
                    field.defaultValue;
            } else {
                delete normalizedData[
                    field.key
                ];
            }

            continue;
        }

        if (
            field.dataType === "array" &&
            Array.isArray(
                normalizedData[
                    field.key
                ]
            )
        ) {
            if (
                field.key === "assigned_users" &&
                normalizedData[field.key].length === 1 &&
                normalizedData[field.key][0] === "anyone"
            ) {
                continue;
            }

            normalizedData[
                field.key
            ] =
                normalizedData[
                    field.key
                ].map(
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

function normalizeAssignedUsers(
    value
) {
    if (
        value === "anyone" ||
        (
            Array.isArray(value) &&
            value.length === 1 &&
            value[0] === "anyone"
        )
    ) {
        return "anyone";
    }

    if (!Array.isArray(value)) {
        return null;
    }

    const normalized =
        value.map((item) => {
            if (
                item &&
                typeof item === "object" &&
                item.user_id !== undefined
            ) {
                return Number(
                    item.user_id
                );
            }

            return Number(item);
        });

    if (
        normalized.some(
            (userId) =>
                !Number.isInteger(
                    userId
                ) ||
                userId < 1
        )
    ) {
        return null;
    }

    if (
        new Set(normalized).size !==
        normalized.length
    ) {
        return null;
    }

    return normalized;
}

function isUserAllowed(
    assignedUsers,
    userId
) {
    if (
        assignedUsers ===
        "anyone" ||
        (
            Array.isArray(assignedUsers) &&
            assignedUsers.includes("anyone")
        )
    ) {
        return true;
    }

    if (
        !Array.isArray(
            assignedUsers
        )
    ) {
        return false;
    }

    return assignedUsers.includes(
        Number(userId)
    );
}

async function validateUserIdsExist(
    userIds,
    scope
) {
    if (userIds === "anyone") {
        return;
    }

    const pool = getPool();

    const [rows] =
        await pool.query(
            `
            SELECT
                id
            FROM users
            WHERE id IN (?)
              AND is_active = TRUE
            `,
            [userIds]
        );

    const existingIds =
        new Set(
            rows.map(
                (user) =>
                    Number(user.id)
            )
        );

    for (const userId of userIds) {
        if (
            !existingIds.has(
                Number(userId)
            )
        ) {
            throw new Error(
                `${scope} contains an invalid or inactive user ID: ${userId}`
            );
        }
    }
}

export async function createWorkflowService(
    workflow
) {
    const normalizedCanCreate =
        validateCanCreate(
            workflow?.canCreate
        );

    const normalizedWorkflow = {
        ...workflow,
        canCreate:
            normalizedCanCreate
    };

    validateWorkflow(
        normalizedWorkflow
    );

    await validateUserIdsExist(
        normalizedWorkflow.canCreate,
        "canCreate"
    );

    const workflowId =
        await createWorkflow(
            normalizedWorkflow
        );

    return workflowId;
}

export async function getAllWorkflowsService() {
    return await getAllWorkflows();
}

export async function createWorkflowRunService({
    workflowId,
    stageData,
    userId
}) {
    if (!workflowId) {
        throw new Error(
            "Workflow ID is required"
        );
    }

    if (!userId) {
        throw new Error(
            "Authenticated user is required"
        );
    }

    if (
        !stageData ||
        typeof stageData !==
            "object" ||
        Array.isArray(stageData)
    ) {
        throw new Error(
            "Stage data is required"
        );
    }

    const workflow =
        await getWorkflowById(
            workflowId
        );

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
        !Array.isArray(
            workflow.stages
        ) ||
        workflow.stages.length === 0
    ) {
        throw new Error(
            "Workflow has no stages"
        );
    }

    const normalizedUserId =
        Number(userId);

    if (
        !Number.isInteger(
            normalizedUserId
        ) ||
        normalizedUserId < 1
    ) {
        throw new Error(
            "Invalid authenticated user"
        );
    }

    if (
        !isUserAllowed(
            workflow.canCreate,
            normalizedUserId
        )
    ) {
        throw new Error(
            "You are not allowed to create a run for this workflow"
        );
    }

    const firstStage =
        workflow.stages[0];

    const normalizedStageData =
        applySystemControlledFields(
            firstStage.fields || [],
            stageData
        );

    validateStageData(
        firstStage.fields || [],
        normalizedStageData
    );

    /*
     * Stage 1 assignment is for
     * the next stage.
     */
    if (
        workflow.stages.length > 1
    ) {
        const assignedUsers =
            normalizeAssignedUsers(
                normalizedStageData
                    .assigned_users
            );

        if (!assignedUsers) {
            throw new Error(
                `Stage "${firstStage.name}" must contain valid assigned_users for the next stage`
            );
        }

        await validateUserIdsExist(
            assignedUsers,
            "assigned_users for the next stage"
        );

        normalizedStageData
            .assigned_users =
            assignedUsers;
    }

    const nextStage =
        workflow.stages[1] ||
        null;

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
            stageId:
                firstStage.id,
            stageData:
                normalizedStageData,
            remark:
                normalizedStageData
                    .remark ||
                null,
            performedBy:
                normalizedUserId,
            completed:
                isCompleted
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
    stageData,
    userId
}) {
    if (!workflowRunId) {
        throw new Error(
            "Workflow run ID is required"
        );
    }

    if (!userId) {
        throw new Error(
            "Authenticated user is required"
        );
    }

    if (
        !stageData ||
        typeof stageData !==
            "object" ||
        Array.isArray(stageData)
    ) {
        throw new Error(
            "Stage data is required"
        );
    }

    const normalizedUserId =
        Number(userId);

    if (
        !Number.isInteger(
            normalizedUserId
        ) ||
        normalizedUserId < 1
    ) {
        throw new Error(
            "Invalid authenticated user"
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

    if (
        run.status ===
        "completed"
    ) {
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
                Number(
                    run.currentStageId
                )
        );

    if (
        currentStageIndex === -1
    ) {
        throw new Error(
            `Current stage "${run.currentStageId}" not found in workflow`
        );
    }

    /*
     * Stage 1 is controlled by
     * workflow.canCreate.
     *
     * Every later stage gets its
     * authorization from assigned_users
     * stored in the PREVIOUS stage's
     * stageData.
     */
    if (
        currentStageIndex > 0
    ) {
        const previousStage =
            workflow.stages[
                currentStageIndex - 1
            ];

        const previousHistory =
            await getPreviousStageHistory(
                workflowRunId,
                previousStage.id
            );

        if (!previousHistory) {
            throw new Error(
                "Previous stage history not found"
            );
        }

        let previousStageData =
            previousHistory.stageData;

        if (
            typeof previousStageData ===
            "string"
        ) {
            try {
                previousStageData =
                    JSON.parse(
                        previousStageData
                    );
            } catch {
                throw new Error(
                    "Previous stage data is invalid"
                );
            }
        }

        const assignedUsers =
            normalizeAssignedUsers(
                previousStageData
                    ?.assigned_users
            );

        if (!assignedUsers) {
            throw new Error(
                "No valid users are assigned to the current stage"
            );
        }

        if (
            !isUserAllowed(
                assignedUsers,
                normalizedUserId
            )
        ) {
            throw new Error(
                "You are not assigned to this stage"
            );
        }
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
    
    validateStageData(
        currentStage.fields || [],
        normalizedStageData
    );


    const nextStage =
        workflow.stages[
            currentStageIndex + 1
        ] || null;

    const isCompleted =
        nextStage === null;

    /*
     * The current stage stores
     * assignment for the NEXT stage.
     */
    if (!isCompleted) {
        const assignedUsers =
            normalizeAssignedUsers(
                normalizedStageData
                    .assigned_users
            );

        if (!assignedUsers) {
            throw new Error(
                `Stage "${currentStage.name}" must contain valid assigned_users for the next stage`
            );
        }

        await validateUserIdsExist(
            assignedUsers,
            "assigned_users for the next stage"
        );

        normalizedStageData
            .assigned_users =
            assignedUsers;
    }

    await submitWorkflowStage({
        workflowRunId,
        nextStageId:
            isCompleted
                ? currentStage.id
                : nextStage.id,
        stageId:
            currentStage.id,
        stageData:
            normalizedStageData,
        remark:
            normalizedStageData
                .remark ||
            null,
        performedBy:
            normalizedUserId,
        completed:
            isCompleted
    });

    return {
        workflowRunId,
        referenceId:
            run.referenceId,
        currentStageId:
            isCompleted
                ? currentStage.id
                : nextStage.id,
        status:
            isCompleted
                ? "completed"
                : "running",
        completed:
            isCompleted
    };
}

export async function getActiveWorkflowRunsService() {
    return await getActiveWorkflowRuns();
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
        !Number.isInteger(
            parsedPage
        ) ||
        parsedPage < 1
    ) {
        throw new Error(
            "Page must be a positive integer"
        );
    }

    if (
        !Number.isInteger(
            parsedLimit
        ) ||
        parsedLimit < 1
    ) {
        throw new Error(
            "Limit must be a positive integer"
        );
    }

    const safeLimit =
        Math.min(
            parsedLimit,
            100
        );

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
        !Number.isInteger(
            parsedPage
        ) ||
        parsedPage < 1
    ) {
        throw new Error(
            "Page must be a positive integer"
        );
    }

    if (
        !Number.isInteger(
            parsedLimit
        ) ||
        parsedLimit < 1
    ) {
        throw new Error(
            "Limit must be a positive integer"
        );
    }

    const safeLimit =
        Math.min(
            parsedLimit,
            100
        );

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
        result.rows.map(
            (stage) => {
                const workflowStage =
                    workflow.stages?.find(
                        (item) =>
                            Number(
                                item.id
                            ) ===
                            Number(
                                stage.stageId
                            )
                    );

                return {
                    ...stage,
                    stageName:
                        workflowStage?.name ||
                        `Stage ${stage.stageId}`,
                    fields:
                        workflowStage?.fields || []
                };
            }
        );

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
        await getWorkflowById(
            workflowId
        );

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